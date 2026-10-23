using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>The guard between the tests and the developer's database (design D3 "Safety"). No database is touched here.</summary>
[Trait("Area", "infra")]
public class DatabaseGuardTests
{
    [Theory]
    [InlineData("drags")]
    [InlineData("postgres")]
    [InlineData("drags_infra")]
    [InlineData("drags_it_")]
    [InlineData("drags_it_run")]
    [InlineData("drags_it_Run_1")]
    [InlineData("drags_it_run_1; DROP DATABASE drags")]
    [InlineData("xdrags_it_run_1")]
    [InlineData("")]
    [InlineData(null)]
    public void Refuses_any_database_not_named_drags_it_run_n(string database)
    {
        Should.Throw<InvalidOperationException>(() => DatabaseGuard.EnsureName(database))
            .Message.ShouldContain("Test database guard");
    }

    [Theory]
    [InlineData("drags_it_infra20261015_1")]
    [InlineData("drags_it_local1a2b_tpl")]
    [InlineData("drags_it_local1a2b_tpl_bare")]
    public void Accepts_a_test_database(string database) => DatabaseGuard.EnsureName(database);

    [Theory]
    [InlineData("10.0.0.5")]
    [InlineData("db.example.com")]
    [InlineData("")]
    public void Refuses_a_server_other_than_the_local_one(string host)
    {
        Should.Throw<InvalidOperationException>(() =>
                DatabaseGuard.Ensure($"Host={host};Port=5432;Database=drags_it_x_1;Username=drags;Password=drags"))
            .Message.ShouldContain("Test database guard");
    }

    [Fact]
    public void The_test_host_refuses_the_developer_database_before_starting()
    {
        Should.Throw<InvalidOperationException>(() =>
                new ClinicHubFactory("Host=localhost;Port=5432;Database=drags;Username=drags;Password=drags"))
            .Message.ShouldContain("Test database guard");
    }

    [Fact]
    public void The_app_refuses_a_configuration_that_points_elsewhere_before_any_connection()
    {
        // A valid test name outside, but the app's configuration overridden to another database: the DbContext guard
        // stops the startup (migrations) before it connects. The override names a database that does not exist, so a
        // broken guard fails this test with a connection error instead of touching real data.
        using var factory = new ClinicHubFactory(
            "Host=localhost;Port=5432;Database=drags_it_guard_0;Username=drags;Password=drags",
            new Dictionary<string, string>
            {
                ["ConnectionStrings:DefaultConnection"] =
                    "Host=localhost;Port=5432;Database=drags_guard_probe;Username=drags;Password=drags",
            });

        Should.Throw<InvalidOperationException>(factory.Start).Message.ShouldContain("Test database guard");
    }
}
