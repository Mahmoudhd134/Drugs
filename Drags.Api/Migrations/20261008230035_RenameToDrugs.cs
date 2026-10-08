using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class RenameToDrugs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {

            migrationBuilder.CreateTable(
                name: "DrugGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DrugGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Drugs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Drugs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DrugGroupItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    DrugGroupId = table.Column<int>(type: "INTEGER", nullable: false),
                    DrugId = table.Column<int>(type: "INTEGER", nullable: false),
                    Order = table.Column<int>(type: "INTEGER", nullable: false)
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

            // Move existing data into the renamed tables, keeping ids
            migrationBuilder.Sql("INSERT INTO Drugs (Id, Name, Description) SELECT Id, Name, Description FROM Drags;");
            migrationBuilder.Sql("INSERT INTO DrugGroups (Id, Name) SELECT Id, COALESCE(NULLIF(TRIM(Name), ''), 'Group ' || Id) FROM Combos;");
            migrationBuilder.Sql("INSERT INTO DrugGroupItems (Id, DrugGroupId, DrugId, \"Order\") SELECT Id, ComboId, DragId, \"Order\" FROM ComboDrags;");

            migrationBuilder.DropTable(
                name: "ComboDrags");

            migrationBuilder.DropTable(
                name: "Combos");

            migrationBuilder.DropTable(
                name: "Drags");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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
                name: "Drags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Drags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ComboDrags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ComboId = table.Column<int>(type: "INTEGER", nullable: false),
                    DragId = table.Column<int>(type: "INTEGER", nullable: false),
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

            migrationBuilder.Sql("INSERT INTO Drags (Id, Name, Description) SELECT Id, Name, Description FROM Drugs;");
            migrationBuilder.Sql("INSERT INTO Combos (Id, Name) SELECT Id, Name FROM DrugGroups;");
            migrationBuilder.Sql("INSERT INTO ComboDrags (Id, ComboId, DragId, \"Order\") SELECT Id, DrugGroupId, DrugId, \"Order\" FROM DrugGroupItems;");

            migrationBuilder.DropTable(
                name: "DrugGroupItems");

            migrationBuilder.DropTable(
                name: "DrugGroups");

            migrationBuilder.DropTable(
                name: "Drugs");
        }
    }
}
