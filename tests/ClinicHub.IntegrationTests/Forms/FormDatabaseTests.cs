using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>
/// What the database itself refuses (contract § 5, design D7): one active version per form, whatever the app does. The states are raw SQL. The foreign
/// key to the active version is deferred, so its cases run an explicit transaction: every statement must pass, and the failure comes at COMMIT.
/// </summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormDatabaseTests(AppFixture app) : IntegrationTest(app)
{
    private const string ActiveForeignKey = "FK_Forms_FormVersions_Active";
    private const string Definition = "{}";

    [Fact]
    [Trait("Case", "FRM-110")]
    public async Task A_form_whose_active_version_doesnt_exist_fails_at_commit()
    {
        var id = await NewFormIdAsync();

        var failure = await CommitFailureAsync(InsertForm(id, "1"));

        ShouldBeRefusedByTheActiveForeignKey(failure);
        (await App.FormRowAsync(id)).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "FRM-111")]
    public async Task A_form_and_its_first_version_in_one_transaction_form_first_commit()
    {
        var id = await NewFormIdAsync();

        var failure = await CommitFailureAsync(InsertForm(id, "1"), InsertVersion(id, 1));

        failure.ShouldBeNull();
        var form = await App.FormRowAsync(id);
        form.ShouldNotBeNull();
        form.ActiveVersionNumber.ShouldBe(1);
        form.IsDeleted.ShouldBeFalse("IsDeleted defaults to false");
        (await App.VersionRowsAsync(id)).ShouldHaveSingleItem().VersionNumber.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "FRM-112")]
    public async Task A_new_form_without_an_active_version_number_is_refused()
    {
        var id = await NewFormIdAsync();

        var failure = await Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync(InsertForm(id, "NULL")));

        ShouldBeNotNullOnTheActiveVersionNumber(failure);
        (await App.FormRowAsync(id)).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "FRM-112")]
    public async Task An_existing_forms_active_version_number_cant_become_null()
    {
        var form = await Data.Form();

        var failure = await Should.ThrowAsync<PostgresException>(
            () => App.OutsideTheApp.ExecuteAsync("""UPDATE "Forms" SET "ActiveVersionNumber" = NULL WHERE "Id" = @p0""", form.Id));

        ShouldBeNotNullOnTheActiveVersionNumber(failure);
        (await App.FormRowAsync(form.Id)).ActiveVersionNumber.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "FRM-113")]
    public async Task Setting_the_active_version_to_a_number_with_no_version_fails_at_commit()
    {
        var form = await Data.Form();

        var failure = await CommitFailureAsync($"""UPDATE "Forms" SET "ActiveVersionNumber" = 99 WHERE "Id" = {form.Id}""");

        ShouldBeRefusedByTheActiveForeignKey(failure);
        (await App.FormRowAsync(form.Id)).ActiveVersionNumber.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "FRM-114")]
    public async Task The_active_versions_row_cant_be_deleted()
    {
        var form = await Data.Form();

        var failure = await CommitFailureAsync($"""DELETE FROM "FormVersions" WHERE "FormId" = {form.Id} AND "VersionNumber" = 1""");

        ShouldBeRefusedByTheActiveForeignKey(failure);
        (await App.VersionRowsAsync(form.Id)).ShouldHaveSingleItem().VersionNumber.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "FRM-114")]
    public async Task A_form_with_versions_cant_be_deleted()
    {
        var form = await Data.Form();

        var failure = await Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync("""DELETE FROM "Forms" WHERE "Id" = @p0""", form.Id));

        // A restrict violation: PostgreSQL 18 reports it as 23001, earlier versions as a foreign key violation
        new[] { PostgresErrorCodes.ForeignKeyViolation, PostgresErrorCodes.RestrictViolation }.ShouldContain(failure.SqlState);
        (await App.FormRowAsync(form.Id)).ShouldNotBeNull();
        (await App.VersionRowsAsync(form.Id)).ShouldHaveSingleItem();
    }

    [Fact]
    [Trait("Case", "FRM-119")]
    public async Task A_second_version_row_with_the_same_form_and_number_is_refused()
    {
        var form = await Data.Form().WithDefinition("""{"first":true}""");

        var failure = await Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync(InsertVersion(form.Id, 1)));

        failure.SqlState.ShouldBe(PostgresErrorCodes.UniqueViolation);
        (await App.VersionRowsAsync(form.Id)).ShouldHaveSingleItem().Definition.ShouldBe("""{"first":true}""");
    }

    [Fact]
    [Trait("Case", "FRM-167")]
    public async Task IsDeleted_true_with_no_DeletedAt_is_excluded()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form();
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Forms" SET "IsDeleted" = true WHERE "Id" = @p0""", form.Id);

        var page = await SearchAsync(admin, form.Name);

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(0);
        await (await admin.GetAsync(FormsApi.Item(form.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "FRM-167")]
    public async Task IsDeleted_false_with_a_DeletedAt_is_listed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form();
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Forms" SET "DeletedAt" = now() WHERE "Id" = @p0""", form.Id);

        var page = await SearchAsync(admin, form.Name);

        page.Items.ShouldHaveSingleItem().Id.ShouldBe(form.Id);
        page.TotalCount.ShouldBe(1);
        await (await admin.GetAsync(FormsApi.Item(form.Id))).ShouldBeOkAsync();
    }

    private static async Task<PagedResult<FormSummary>> SearchAsync(Harness.Clients.ApiClient admin, string name)
    {
        var response = await admin.GetAsync($"{FormsApi.Route}?search={Uri.EscapeDataString(name)}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<FormSummary>>();
    }

    private static void ShouldBeRefusedByTheActiveForeignKey(PostgresException failure)
    {
        failure.ShouldNotBeNull("the commit should have failed");
        failure.SqlState.ShouldBe(PostgresErrorCodes.ForeignKeyViolation);
        failure.ConstraintName.ShouldBe(ActiveForeignKey);
    }

    private static void ShouldBeNotNullOnTheActiveVersionNumber(PostgresException failure)
    {
        failure.SqlState.ShouldBe(PostgresErrorCodes.NotNullViolation);
        failure.ColumnName.ShouldBe("ActiveVersionNumber");
    }

    /// <summary>An id of the table's own sequence, so a row inserted by hand never meets one the app gives.</summary>
    private Task<int> NewFormIdAsync() =>
        App.OutsideTheApp.ScalarAsync<int>("""SELECT nextval(pg_get_serial_sequence('"Forms"', 'Id'))::int""");

    // The id and number come from the test, never input
    private static string InsertForm(int id, string activeVersion) =>
        $"""INSERT INTO "Forms" ("Id", "Name", "ActiveVersionNumber", "CreatedAt", "UpdatedAt") VALUES ({id}, 'Raw form', {activeVersion}, now(), now())""";

    private static string InsertVersion(int formId, int number) =>
        $"""INSERT INTO "FormVersions" ("FormId", "VersionNumber", "Definition", "CreatedAt", "UpdatedAt") VALUES ({formId}, {number}, '{Definition}', now(), now())""";

    /// <summary>
    /// Runs the statements in one explicit transaction, then commits. A failure of a statement fails the test, so a check that isn't deferred shows;
    /// the failure of the commit is returned, null when it committed.
    /// </summary>
    private async Task<PostgresException> CommitFailureAsync(params string[] statements)
    {
        await using var connection = new NpgsqlConnection(App.Factory.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        foreach (var statement in statements)
        {
            await using var command = new NpgsqlCommand(statement, connection, transaction);
            await command.ExecuteNonQueryAsync();
        }

        try
        {
            await transaction.CommitAsync();
            return null;
        }
        catch (PostgresException failure)
        {
            return failure;
        }
    }
}
