using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DrugGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DrugGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Drugs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    DefaultDosing_DoseAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    DefaultDosing_DoseUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DefaultDosing_Frequency = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DefaultDosing_FrequencyValue = table.Column<int>(type: "integer", nullable: true),
                    DefaultDosing_FrequencyText = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DefaultDosing_DurationValue = table.Column<int>(type: "integer", nullable: true),
                    DefaultDosing_DurationUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DefaultDosing_Eye = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    DefaultDosing_TaperSteps = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Drugs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DrugGroupItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DrugGroupId = table.Column<int>(type: "integer", nullable: false),
                    DrugId = table.Column<int>(type: "integer", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    Dosing_DoseAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    Dosing_DoseUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Dosing_Frequency = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Dosing_FrequencyValue = table.Column<int>(type: "integer", nullable: true),
                    Dosing_FrequencyText = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Dosing_DurationValue = table.Column<int>(type: "integer", nullable: true),
                    Dosing_DurationUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Dosing_Eye = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Dosing_TaperSteps = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DrugGroupItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DrugGroupItems_DrugGroups_DrugGroupId",
                        column: x => x.DrugGroupId,
                        principalTable: "DrugGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DrugGroupItems_Drugs_DrugId",
                        column: x => x.DrugId,
                        principalTable: "Drugs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DrugGroupItems_DrugGroupId",
                table: "DrugGroupItems",
                column: "DrugGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_DrugGroupItems_DrugId",
                table: "DrugGroupItems",
                column: "DrugId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DrugGroupItems");

            migrationBuilder.DropTable(
                name: "DrugGroups");

            migrationBuilder.DropTable(
                name: "Drugs");
        }
    }
}
