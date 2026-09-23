using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCombos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Combos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Combos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ComboDrags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    DragId = table.Column<int>(type: "INTEGER", nullable: false),
                    ComboId = table.Column<int>(type: "INTEGER", nullable: false),
                    Order = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComboDrags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComboDrags_Combos_ComboId",
                        column: x => x.ComboId,
                        principalTable: "Combos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ComboDrags_Drags_DragId",
                        column: x => x.DragId,
                        principalTable: "Drags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ComboDrags_ComboId",
                table: "ComboDrags",
                column: "ComboId");

            migrationBuilder.CreateIndex(
                name: "IX_ComboDrags_DragId",
                table: "ComboDrags",
                column: "DragId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ComboDrags");

            migrationBuilder.DropTable(
                name: "Combos");
        }
    }
}
