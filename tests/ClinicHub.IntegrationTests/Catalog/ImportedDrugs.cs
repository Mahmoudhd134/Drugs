namespace ClinicHub.IntegrationTests.Catalog;

/// <summary>
/// Real shared drugs of the imported catalog used by the tests, by exact name (M1.7b contract § 4.3; design M1.7
/// test cases "Test data"). Read only: tests look them up (<c>Data.Shared(name)</c>, <c>GET /drugs?search=</c>) and never
/// change them; a test that writes the shared catalog creates its own row (<c>Data.SharedDrug()</c>).
/// </summary>
public static class ImportedDrugs
{
    /// <summary>AMOXICILLIN, «مضادات العدوى › البنسلينات»; hidden Arabic name «أليموكس».</summary>
    public const string Alemox1Gm = "ALEMOX 1 GM 12 F.C.TABS.";

    /// <summary>The other drug whose hidden Arabic name is «أليموكس».</summary>
    public const string Alemox750Mg = "ALEMOX 750 MG 12 F.C.TABS.";

    /// <summary>MOXIFLOXACIN, «العيون › مضادات العدوى للعين».</summary>
    public const string Vigamox = "VIGAMOX 0.5% EYE DROPS 5 ML";

    /// <summary>DEXAMETHASONE+TOBRAMYCIN, «العيون › مضادات الالتهاب للعين».</summary>
    public const string TobradexDrops = "TOBRADEX EYE SUSP. DROPS 5 ML";

    /// <summary>«العيون › مضادات الالتهاب للعين».</summary>
    public const string TobradexOintment = "TOBRADEX EYE OINT. 3.5 GM";

    /// <summary>«العيون › المياه الزرقاء».</summary>
    public const string Xalatan = "XALATAN 50MCG/ML EYE DROPS 2.5 ML";

    /// <summary>No ingredients; hidden Arabic name «نايلنير».</summary>
    public const string Nailner = "NAILNER NAIL FUNGUS PEN 4 ML";

    /// <summary>The first shared name in name order (11 names start with a digit).</summary>
    public const string FirstByName = "1 2 3 (ONE TWO THREE) 20 F.C.TABS.";

    // Category names (Arabic: the UI's; design M1.7 D5)
    public const string EyeAr = "العيون";
    public const string GlaucomaAr = "المياه الزرقاء";
    public const string EyeAntiInfectivesAr = "مضادات العدوى للعين";
    public const string EyeAntiInflammatoryAr = "مضادات الالتهاب للعين";
    public const string AntiInfectivesAr = "مضادات العدوى";
    public const string PenicillinsAr = "البنسلينات";
}
