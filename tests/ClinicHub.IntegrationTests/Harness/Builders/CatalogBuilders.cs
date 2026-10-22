using System.Runtime.CompilerServices;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Protocols.Commands.CreateProtocol;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary><see cref="CreateDrugCommand"/> in the clinic (or the template).</summary>
public sealed class DrugBuilder(AppFixture app, int clinicId)
{
    private string name = Unique.Name("Drug", "دواء");
    private string description;
    private Dosing dosing;

    public DrugBuilder Named(string value)
    {
        name = value;
        return this;
    }

    public DrugBuilder Described(string value)
    {
        description = value;
        return this;
    }

    /// <summary>The default dosing (see <see cref="Dosings"/> for common ones).</summary>
    public DrugBuilder WithDosing(Dosing value)
    {
        dosing = value;
        return this;
    }

    public async Task<DrugDto> CreateAsync() =>
        (await app.SendAsync(new CreateDrugCommand(name, description, dosing), clinicId)).ShouldSucceed();

    public TaskAwaiter<DrugDto> GetAwaiter() => CreateAsync().GetAwaiter();
}

/// <summary><see cref="CreateProtocolCommand"/> in the clinic (or the template): lines in the order added (default: one new drug).</summary>
public sealed class ProtocolBuilder(AppFixture app, int clinicId)
{
    private string name = Unique.Name("Group", "مجموعة");
    private readonly List<SaveProtocolItem> items = [];

    public ProtocolBuilder Named(string value)
    {
        name = value;
        return this;
    }

    /// <summary>A line: the drug with an optional override (null = the drug's default; eye may be <c>ask</c>).</summary>
    public ProtocolBuilder With(int drugId, Dosing overrideDosing = null)
    {
        items.Add(new SaveProtocolItem(drugId, overrideDosing));
        return this;
    }

    public ProtocolBuilder With(DrugDto drug, Dosing overrideDosing = null) => With(drug.Id, overrideDosing);

    /// <summary>Creates the group; with no line added, one line with a new default drug of the same clinic (a group needs one).</summary>
    public async Task<ProtocolDto> CreateAsync()
    {
        if (items.Count == 0)
            items.Add(new SaveProtocolItem((await new DrugBuilder(app, clinicId).CreateAsync()).Id, null));
        return (await app.SendAsync(new CreateProtocolCommand(name, items), clinicId)).ShouldSucceed();
    }

    public TaskAwaiter<ProtocolDto> GetAwaiter() => CreateAsync().GetAwaiter();
}

/// <summary>Common valid dosings (codes: <see cref="DosingCodes"/>).</summary>
public static class Dosings
{
    /// <summary>e.g. 1 drop 4 times a day for 1 week, both eyes.</summary>
    public static Dosing Drops(decimal amount = 1, int timesADay = 4, int weeks = 1, string eye = "both") => new()
    {
        DoseAmount = amount, DoseUnit = "drop", Frequency = "daily", FrequencyValue = timesADay,
        DurationValue = weeks, DurationUnit = "weeks", Eye = eye,
    };

    /// <summary>e.g. 1 tablet every 8 hours for 5 days (no eye).</summary>
    public static Dosing Tablets(decimal amount = 1, int everyHours = 8, int days = 5) => new()
    {
        DoseAmount = amount, DoseUnit = "tablet", Frequency = "everyHours", FrequencyValue = everyHours,
        DurationValue = days, DurationUnit = "days",
    };

    /// <summary>A taper of "times a day" steps, one week each (e.g. 4, 3, 2, 1), drops in <paramref name="eye"/>.</summary>
    public static Dosing Taper(string eye = "both", params int[] timesADay) => new()
    {
        DoseAmount = 1, DoseUnit = "drop", Eye = eye,
        TaperSteps = (timesADay.Length > 0 ? timesADay : [4, 3, 2, 1]).Select(times => new TaperStep
        {
            Frequency = "daily", FrequencyValue = times, DurationValue = 1, DurationUnit = "weeks",
        }).ToList(),
    };

    /// <summary>A group-line override: only the eye, asked when the group is added.</summary>
    public static Dosing AskEye() => new() { Eye = DosingCodes.AskEye };
}
