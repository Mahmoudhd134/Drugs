using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicHub.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SearchName",
                table: "Staff",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"FullName\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true);

            migrationBuilder.AddColumn<string>(
                name: "SearchName",
                table: "Drugs",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true);

            migrationBuilder.AddColumn<string>(
                name: "SearchName",
                table: "DrugGroups",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true);

            migrationBuilder.AddColumn<string>(
                name: "SearchName",
                table: "Clinics",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SearchName",
                table: "Staff");

            migrationBuilder.DropColumn(
                name: "SearchName",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "SearchName",
                table: "DrugGroups");

            migrationBuilder.DropColumn(
                name: "SearchName",
                table: "Clinics");
        }
    }
}
