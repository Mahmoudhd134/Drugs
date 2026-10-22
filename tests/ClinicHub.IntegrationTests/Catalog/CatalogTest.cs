using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog;

/// <summary>
/// The catalog tests' local helpers: a clinic (and its owner, who holds every permission) shared by the class, an
/// empty clinic for exact lists, and the drug and group API calls.
/// </summary>
public abstract class CatalogTest(AppFixture app) : IntegrationTest(app)
{
    protected const string DrugsUrl = "/api/v1/drugs";
    protected const string ProtocolsUrl = "/api/v1/drug-groups";

    /// <summary>An id no row has (ids are positive and grow from 1 inside a run).</summary>
    protected const int UnknownId = int.MaxValue;

    /// <summary>A clinic for the whole class (it holds the template's copied catalog and every test's data).</summary>
    protected Task<ClinicHandle> SharedClinicAsync() => App.PerClassAsync("catalog:clinic", () => Data.Clinic().CreateAsync());

    /// <summary>The shared clinic's owner (every permission), one session for the class.</summary>
    protected async Task<ApiClient> OwnerAsync()
    {
        var clinic = await SharedClinicAsync();
        return await Login.SharedAsync("catalog:owner", () => Login.OwnerAsync(clinic));
    }

    /// <summary>
    /// A new clinic without the template's copied drugs and groups (deleted through the use cases), and its owner:
    /// its lists hold exactly what the test adds.
    /// </summary>
    protected async Task<(ClinicHandle Clinic, ApiClient Owner)> EmptyClinicAsync()
    {
        var clinic = await Data.Clinic();
        var groupIds = await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters()
            .Where(g => g.ClinicId == clinic.Id).Select(g => g.Id).ToListAsync());
        foreach (var id in groupIds)
            await Data.DeleteProtocolAsync(clinic.Id, id);
        var drugIds = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
            .Where(d => d.ClinicId == clinic.Id).Select(d => d.Id).ToListAsync());
        foreach (var id in drugIds)
            await Data.DeleteDrugAsync(clinic.Id, id);
        return (clinic, await Login.OwnerAsync(clinic));
    }

    // ---- Drugs ----

    protected static object DrugBody(string name, string description = null, object defaultDosing = null) =>
        new { name, description, defaultDosing };

    protected static Task<HttpResponseMessage> PostDrugAsync(ApiClient client, string name, string description = null,
        object defaultDosing = null) => client.PostAsync(DrugsUrl, DrugBody(name, description, defaultDosing));

    protected static Task<HttpResponseMessage> PutDrugAsync(ApiClient client, int id, string name, string description = null,
        object defaultDosing = null) => client.PutAsync($"{DrugsUrl}/{id}", DrugBody(name, description, defaultDosing));

    /// <summary>POST /drugs, asserting 201.</summary>
    protected static async Task<DrugDto> CreateDrugAsync(ApiClient client, string name, string description = null,
        object defaultDosing = null)
    {
        var response = await PostDrugAsync(client, name, description, defaultDosing);
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<DrugDto>();
    }

    /// <summary>GET /drugs/{id}, asserting 200.</summary>
    protected static async Task<DrugDto> GetDrugAsync(ApiClient client, int id)
    {
        var response = await client.GetAsync($"{DrugsUrl}/{id}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<DrugDto>();
    }

    /// <summary>GET /drugs?{query}, asserting 200.</summary>
    protected static async Task<PagedResult<DrugDto>> ListDrugsAsync(ApiClient client, string query = "")
    {
        var response = await client.GetAsync(query == "" ? DrugsUrl : $"{DrugsUrl}?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<DrugDto>>();
    }

    /// <summary>The names found by a drug search (first 100, in the answered order).</summary>
    protected static async Task<List<string>> SearchDrugNamesAsync(ApiClient client, string search) =>
        (await ListDrugsAsync(client, $"search={Uri.EscapeDataString(search)}&pageSize=100")).Items.Select(d => d.Name).ToList();

    // ---- Groups ----

    protected static object Item(int drugId, object dosing = null) => new { drugId, dosing };

    protected static object ProtocolBody(string name, params object[] items) => new { name, items };

    protected static Task<HttpResponseMessage> PostProtocolAsync(ApiClient client, string name, params object[] items) =>
        client.PostAsync(ProtocolsUrl, ProtocolBody(name, items));

    protected static Task<HttpResponseMessage> PutProtocolAsync(ApiClient client, int id, string name, params object[] items) =>
        client.PutAsync($"{ProtocolsUrl}/{id}", ProtocolBody(name, items));

    /// <summary>POST /drug-groups, asserting 201.</summary>
    protected static async Task<ProtocolDto> CreateProtocolAsync(ApiClient client, string name, params object[] items)
    {
        var response = await PostProtocolAsync(client, name, items);
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<ProtocolDto>();
    }

    /// <summary>GET /drug-groups/{id}, asserting 200.</summary>
    protected static async Task<ProtocolDto> GetProtocolAsync(ApiClient client, int id)
    {
        var response = await client.GetAsync($"{ProtocolsUrl}/{id}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<ProtocolDto>();
    }

    /// <summary>GET /drug-groups?{query}, asserting 200.</summary>
    protected static async Task<PagedResult<ProtocolDto>> ListProtocolsAsync(ApiClient client, string query = "")
    {
        var response = await client.GetAsync(query == "" ? ProtocolsUrl : $"{ProtocolsUrl}?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<ProtocolDto>>();
    }

    /// <summary>The names found by a group search (first 100, in the answered order).</summary>
    protected static async Task<List<string>> SearchProtocolNamesAsync(ApiClient client, string search) =>
        (await ListProtocolsAsync(client, $"search={Uri.EscapeDataString(search)}&pageSize=100")).Items.Select(g => g.Name).ToList();

    // ---- Assertions ----

    /// <summary>The path of a <c>Location</c> header (absolute or relative).</summary>
    protected static string LocationPath(HttpResponseMessage response)
    {
        var location = response.Headers.Location;
        location.ShouldNotBeNull("Location header");
        return location.IsAbsoluteUri ? location.AbsolutePath : location.OriginalString;
    }

    /// <summary>Every field of <paramref name="actual"/> equals <paramref name="expected"/> (numbers by value, steps in order).</summary>
    protected static void ShouldMatch(Dosing actual, Dosing expected)
    {
        if (expected is null)
        {
            actual.ShouldBeNull();
            return;
        }

        actual.ShouldNotBeNull();
        actual.DoseAmount.ShouldBe(expected.DoseAmount, "doseAmount");
        actual.DoseUnit.ShouldBe(expected.DoseUnit, "doseUnit");
        actual.Frequency.ShouldBe(expected.Frequency, "frequency");
        actual.FrequencyValue.ShouldBe(expected.FrequencyValue, "frequencyValue");
        actual.FrequencyText.ShouldBe(expected.FrequencyText, "frequencyText");
        actual.DurationValue.ShouldBe(expected.DurationValue, "durationValue");
        actual.DurationUnit.ShouldBe(expected.DurationUnit, "durationUnit");
        actual.Eye.ShouldBe(expected.Eye, "eye");
        if (expected.TaperSteps is null)
        {
            actual.TaperSteps.ShouldBeNull("taperSteps");
            return;
        }

        actual.TaperSteps.ShouldNotBeNull("taperSteps");
        actual.TaperSteps.Count.ShouldBe(expected.TaperSteps.Count, "taperSteps count");
        for (var i = 0; i < expected.TaperSteps.Count; i++)
        {
            var (a, e) = (actual.TaperSteps[i], expected.TaperSteps[i]);
            a.DoseAmount.ShouldBe(e.DoseAmount, $"taperSteps[{i}].doseAmount");
            a.Frequency.ShouldBe(e.Frequency, $"taperSteps[{i}].frequency");
            a.FrequencyValue.ShouldBe(e.FrequencyValue, $"taperSteps[{i}].frequencyValue");
            a.DurationValue.ShouldBe(e.DurationValue, $"taperSteps[{i}].durationValue");
            a.DurationUnit.ShouldBe(e.DurationUnit, $"taperSteps[{i}].durationUnit");
        }
    }

    // ---- Dosing values ----

    protected static TaperStep Step(string frequency, int? frequencyValue, string durationUnit, int? durationValue,
        decimal? doseAmount = null) => new()
    {
        Frequency = frequency, FrequencyValue = frequencyValue, DurationUnit = durationUnit, DurationValue = durationValue,
        DoseAmount = doseAmount,
    };

    /// <summary>A step "daily N times for W weeks".</summary>
    protected static TaperStep Daily(int times, int weeks = 1, decimal? doseAmount = null) =>
        Step("daily", times, "weeks", weeks, doseAmount);

    /// <summary>1 drop with these steps (no dosing-level frequency or duration).</summary>
    protected static Dosing Taper(params TaperStep[] steps) => new() { DoseAmount = 1, DoseUnit = "drop", TaperSteps = [.. steps] };
}
