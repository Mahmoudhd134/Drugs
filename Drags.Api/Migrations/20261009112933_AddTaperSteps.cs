using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTaperSteps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultDosing_TaperSteps",
                table: "Drugs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosing_TaperSteps",
                table: "DrugGroupItems",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultDosing_TaperSteps",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "Dosing_TaperSteps",
                table: "DrugGroupItems");
        }
    }
}
