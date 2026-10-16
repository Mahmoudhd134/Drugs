using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Infrastructure.Access;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

internal static class LabeledWait
{
    /// <summary>Waits at most <paramref name="timeout"/>; a timeout names what was awaited.</summary>
    public static async Task<T> WaitAsync<T>(this Task<T> task, TimeSpan timeout, string what)
    {
        try { return await task.WaitAsync(timeout); }
        catch (TimeoutException) { throw new TimeoutException($"Timed out waiting for {what}."); }
    }

    public static async Task WaitAsync(this Task task, TimeSpan timeout, string what)
    {
        try { await task.WaitAsync(timeout); }
        catch (TimeoutException) { throw new TimeoutException($"Timed out waiting for {what}."); }
    }
}

/// <summary>The access cache loads a staff member's access once for parallel requests (access tech § Cache: no stampede).</summary>
[Collection(AccessCollection2.Name)]
[Trait("Area", "access")]
public class AccessCacheLoadTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ACC-055")]
    public async Task Twenty_parallel_requests_right_after_login_all_succeed_and_load_the_staff_access_once()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Assistant");
        var staffQueries = new StaffQueryCounter();
        // The same app, with the database commands that read the Staff table counted
        await using var variant = App.CreateVariant(services: services =>
            services.ConfigureDbContext<AppDbContext>((_, options) => options.AddInterceptors(staffQueries)));
        variant.Start();
        var user = await Login.On(variant).StaffAsync(staff);
        staffQueries.Reset();

        var responses = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => user.GetAsync("/api/v1/drugs")));

        foreach (var response in responses)
            await response.ShouldBeOkAsync();
        staffQueries.Count.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "ACC-056")]
    public async Task When_the_first_request_of_a_shared_load_is_aborted_the_others_still_succeed()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Assistant");
        var gate = new StaffQueryGate();
        CallCountingCache cache = null;
        // The same app; the staff access load can be held, and the cache's callers are counted
        await using var variant = App.CreateVariant(services: services =>
        {
            services.ConfigureDbContext<AppDbContext>((_, options) => options.AddInterceptors(gate));
            services.RemoveAll<IAccessCache>();
            services.AddSingleton<IAccessCache>(provider =>
                cache = new CallCountingCache(ActivatorUtilities.CreateInstance<AccessCache>(provider)));
        });
        variant.Start();
        var user = await Login.On(variant).StaffAsync(staff);
        gate.Hold();

        using var abort = new CancellationTokenSource();
        try
        {
            var first = SendAsync(user, abort.Token);
            await gate.Started.WaitAsync(Patience, "the first request's load");
            var others = Enumerable.Range(0, 4).Select(_ => SendAsync(user, CancellationToken.None)).ToList();
            // All five requests wait on the one load (the cache joined them before returning)
            await cache.StaffCalls(5).WaitAsync(Patience, "the other requests joining the load");
            await abort.CancelAsync();
            gate.Release();
            // The aborted request ends one way or another (the client gave up on it)
            await Should.ThrowAsync<OperationCanceledException>(() => first.WaitAsync(Patience, "the aborted request"));

            foreach (var response in await Task.WhenAll(others).WaitAsync(Patience, "the other requests"))
                response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
            gate.Loads.ShouldBe(1);
        }
        finally
        {
            gate.Release();
        }
    }

    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(30);

    private static Task<HttpResponseMessage> SendAsync(ApiClient client, CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/drugs");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", client.AccessToken);
        return client.Http.SendAsync(request, cancellationToken);
    }

    /// <summary>Holds the next staff access loads until <see cref="Release"/>, and counts them.</summary>
    private sealed class StaffQueryGate : DbCommandInterceptor
    {
        private readonly TaskCompletionSource started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private volatile bool holding;
        private int loads;

        public Task Started => started.Task;
        public int Loads => Volatile.Read(ref loads);

        public void Hold() => holding = true;

        public void Release() => released.TrySetResult();

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (holding && command.CommandText.Contains("FROM \"Staff\""))
            {
                Interlocked.Increment(ref loads);
                started.TrySetResult();
                await released.Task.WaitAsync(cancellationToken);
            }
            return result;
        }
    }

    /// <summary>The app's cache, counting the calls of <see cref="GetStaffAsync"/> once each has joined the cache.</summary>
    private sealed class CallCountingCache(IAccessCache inner) : IAccessCache
    {
        private readonly object sync = new();
        private readonly List<(int Count, TaskCompletionSource Done)> waiters = [];
        private int staffCalls;

        public Task StaffCalls(int count)
        {
            lock (sync)
            {
                if (staffCalls >= count)
                    return Task.CompletedTask;
                var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                waiters.Add((count, done));
                return done.Task;
            }
        }

        public async Task<StaffAccess> GetStaffAsync(int staffId, int userId, int clinicId, CancellationToken cancellationToken = default)
        {
            var load = inner.GetStaffAsync(staffId, userId, clinicId, cancellationToken);
            lock (sync)
            {
                staffCalls++;
                foreach (var waiter in waiters.Where(w => w.Count <= staffCalls))
                    waiter.Done.TrySetResult();
            }
            return await load;
        }

        public Task<RoleAccess> GetRolePermissionsAsync(int roleId, int clinicId, CancellationToken cancellationToken = default) =>
            inner.GetRolePermissionsAsync(roleId, clinicId, cancellationToken);

        public Task<UserAccess> GetUserAsync(int userId, CancellationToken cancellationToken = default) =>
            inner.GetUserAsync(userId, cancellationToken);

        public Task<ClinicAccess> GetClinicAsync(int clinicId, CancellationToken cancellationToken = default) =>
            inner.GetClinicAsync(clinicId, cancellationToken);

        public Task InvalidateStaffAsync(int staffId, CancellationToken cancellationToken = default) =>
            inner.InvalidateStaffAsync(staffId, cancellationToken);

        public Task InvalidateRoleAsync(int roleId, CancellationToken cancellationToken = default) =>
            inner.InvalidateRoleAsync(roleId, cancellationToken);

        public Task InvalidateClinicAsync(int clinicId, CancellationToken cancellationToken = default) =>
            inner.InvalidateClinicAsync(clinicId, cancellationToken);

        public Task InvalidateUserAsync(int userId, CancellationToken cancellationToken = default) =>
            inner.InvalidateUserAsync(userId, cancellationToken);
    }

    private sealed class StaffQueryCounter : DbCommandInterceptor
    {
        private int count;

        public int Count => Volatile.Read(ref count);

        public void Reset() => Interlocked.Exchange(ref count, 0);

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("FROM \"Staff\""))
                Interlocked.Increment(ref count);
            return ValueTask.FromResult(result);
        }

        public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result)
        {
            if (command.CommandText.Contains("FROM \"Staff\""))
                Interlocked.Increment(ref count);
            return result;
        }
    }
}
