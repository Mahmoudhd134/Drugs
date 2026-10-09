using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDrugDefaultDosing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DefaultDosing_DoseAmount",
                table: "Drugs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultDosing_DoseUnit",
                table: "Drugs",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultDosing_DurationUnit",
                table: "Drugs",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultDosing_DurationValue",
                table: "Drugs",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultDosing_Eye",
                table: "Drugs",
                type: "TEXT",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultDosing_Frequency",
                table: "Drugs",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultDosing_FrequencyText",
                table: "Drugs",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultDosing_FrequencyValue",
                table: "Drugs",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultDosing_DoseAmount",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_DoseUnit",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_DurationUnit",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_DurationValue",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_Eye",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_Frequency",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_FrequencyText",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "DefaultDosing_FrequencyValue",
                table: "Drugs");
        }
    }
}
