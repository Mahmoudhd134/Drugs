using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>Builder defaults are valid data, and the assertion helpers check what they claim.</summary>
[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class BuilderTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task A_group_with_no_line_given_gets_one_new_drug_of_its_clinic()
    {
        var clinic = await Data.Clinic();

        var group = await Data.Protocol(clinic);

        var line = group.Items.ShouldHaveSingleItem();
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == line.Drug.Id))).ClinicId.ShouldBe(clinic.Id);
    }

    [Fact]
    public async Task A_problem_without_its_content_type_fails_the_problem_assertion()
    {
        var response = new HttpResponseMessage(HttpStatusCode.Forbidden)
        {
            Content = new StringContent("""{"status":403,"code":"noAccess","errors":[{"code":"noAccess"}]}""", Encoding.UTF8),
        };
        response.Content.Headers.ContentType = null;

        (await Record.ExceptionAsync(() => response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess")))
            .ShouldBeOfType<ShouldAssertException>().Message.ShouldContain("ContentType");

        response.Content.Headers.ContentType = new MediaTypeHeaderValue("application/problem+json");
        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    public void ShouldHaveNull_needs_the_key_present_with_a_null_value()
    {
        JsonNode.Parse("""{"context":null,"staff":1}""").ShouldHaveNull("context");

        foreach (var json in new[] { "{}", """{"context":1}""", """{"Context":null}""", """{"context":{}}""" })
            Should.Throw<ShouldAssertException>(() => JsonNode.Parse(json).ShouldHaveNull("context"), json);
    }
}
