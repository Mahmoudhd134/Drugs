using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupItemDosing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Dosing_DoseAmount",
                table: "DrugGroupItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosing_DoseUnit",
                table: "DrugGroupItems",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosing_DurationUnit",
                table: "DrugGroupItems",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Dosing_DurationValue",
                table: "DrugGroupItems",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosing_Eye",
                table: "DrugGroupItems",
                type: "TEXT",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosing_Frequency",
                table: "DrugGroupItems",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosing_FrequencyText",
                table: "DrugGroupItems",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Dosing_FrequencyValue",
                table: "DrugGroupItems",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Dosing_DoseAmount",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_DoseUnit",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_DurationUnit",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_DurationValue",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_Eye",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_Frequency",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_FrequencyText",
                table: "DrugGroupItems");

            migrationBuilder.DropColumn(
                name: "Dosing_FrequencyValue",
                table: "DrugGroupItems");
        }
    }
}
