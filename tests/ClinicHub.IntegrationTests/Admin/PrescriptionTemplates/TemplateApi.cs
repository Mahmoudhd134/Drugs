using System.Net;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Domain.Prescriptions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>The three template routes and what the tests read back (contract § 1.2).</summary>
public static class TemplateApi
{
    /// <summary>The three routes with a valid body on the PUT.</summary>
    public static IReadOnlyList<(HttpMethod Method, string Url, object Body)> Every(int clinicId) =>
    [
        (HttpMethod.Get, LayoutBuilder.Route(clinicId), null),
        (HttpMethod.Put, LayoutBuilder.Route(clinicId), LayoutBuilder.L()),
        (HttpMethod.Delete, LayoutBuilder.Route(clinicId), null),
    ];

    /// <summary>The three methods on a clinic's route, each with this raw body.</summary>
    public static IEnumerable<Task<HttpResponseMessage>> SendRawToEveryRoute(this ApiClient client, int clinicId, string body) =>
        new[] { HttpMethod.Get, HttpMethod.Put, HttpMethod.Delete }.Select(method => client.SendRawAsync(method, LayoutBuilder.Route(clinicId), body));

    public static Task<HttpResponseMessage> PutTemplateAsync(this ApiClient client, int clinicId, PrescriptionLayoutDto layout) =>
        client.PutAsync(LayoutBuilder.Route(clinicId), layout);

    public static Task<HttpResponseMessage> PutRawTemplateAsync(this ApiClient client, int clinicId, string body) =>
        client.SendRawAsync(HttpMethod.Put, LayoutBuilder.Route(clinicId), body);

    /// <summary>PUT, asserting 200; the answer.</summary>
    public static async Task<PrescriptionTemplateDto> SaveTemplateAsync(this ApiClient client, int clinicId, PrescriptionLayoutDto layout)
    {
        var response = await client.PutTemplateAsync(clinicId, layout);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PrescriptionTemplateDto>();
    }

    /// <summary>GET, asserting 200; the answer.</summary>
    public static async Task<PrescriptionTemplateDto> ReadTemplateAsync(this ApiClient client, int clinicId)
    {
        var response = await client.GetAsync(LayoutBuilder.Route(clinicId));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PrescriptionTemplateDto>();
    }

    /// <summary>GET answers 204 with no body.</summary>
    public static async Task ShouldHaveNoTemplateAsync(this ApiClient client, int clinicId)
    {
        var body = await (await client.GetAsync(LayoutBuilder.Route(clinicId))).ShouldBeAsync(HttpStatusCode.NoContent);
        body.ShouldBeEmpty();
    }

    /// <summary>The same schema version, page, items in the same order and calibration (numbers by value: <c>148.0</c> is 148).</summary>
    public static void ShouldMatch(this PrescriptionLayoutDto actual, PrescriptionLayoutDto expected)
    {
        actual.ShouldNotBeNull();
        actual.SchemaVersion.ShouldBe(expected.SchemaVersion);
        actual.Page.ShouldBe(expected.Page);
        actual.Items.ShouldBe(expected.Items);
        actual.Calibration.ShouldBe(expected.Calibration);
    }

    /// <summary>The clinic's rows in the table (by the database: no clinic filter).</summary>
    public static Task<List<PrescriptionTemplate>> TemplateRowsAsync(this AppFixture app, int clinicId) =>
        app.QueryDbAsync(db => db.PrescriptionTemplates.IgnoreQueryFilters().AsNoTracking().Where(t => t.ClinicId == clinicId).ToListAsync());

    /// <summary>The clinic's one row.</summary>
    public static async Task<PrescriptionTemplate> TemplateRowAsync(this AppFixture app, int clinicId) =>
        (await app.TemplateRowsAsync(clinicId)).ShouldHaveSingleItem();

    /// <summary>Every row of the table, of any clinic.</summary>
    public static Task<int> TemplateCountAsync(this AppFixture app) =>
        app.QueryDbAsync(db => db.PrescriptionTemplates.IgnoreQueryFilters().CountAsync());
}
