using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ClinicHub.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSharedCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Design M1.7 § 5: schema only, on a reset database (an empty Drugs table; nothing is checked or refolded).
            // The four SearchName columns become ordinary columns filled by the app (D7): Npgsql drops and adds them, so
            // rows already there get '' until the app saves them. The categories are loaded by load_catalog.py (D11)
            migrationBuilder.DropForeignKey(
                name: "FK_ProtocolItems_Drugs_DrugId_ClinicId",
                table: "ProtocolItems");

            migrationBuilder.DropIndex(
                name: "IX_ProtocolItems_DrugId_ClinicId",
                table: "ProtocolItems");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Drugs_Id_ClinicId",
                table: "Drugs");

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Staff",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldComputedColumnSql: "translate(lower(\"FullName\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')");

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Protocols",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldComputedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')");

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Drugs",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldComputedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')");

            migrationBuilder.AlterColumn<int>(
                name: "ClinicId",
                table: "Drugs",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<string>(
                name: "ActiveIngredients",
                table: "Drugs",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "Drugs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsWithdrawn",
                table: "Drugs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "NameAr",
                table: "Drugs",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SearchOther",
                table: "Drugs",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "SubCategoryId",
                table: "Drugs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "WithdrawnAt",
                table: "Drugs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Clinics",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldComputedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')");

            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    NameEn = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NameAr = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CategoryId = table.Column<int>(type: "integer", nullable: false),
                    NameEn = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NameAr = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubCategories", x => x.Id);
                    table.UniqueConstraint("AK_SubCategories_Id_CategoryId", x => new { x.Id, x.CategoryId });
                    table.ForeignKey(
                        name: "FK_SubCategories_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProtocolItems_DrugId",
                table: "ProtocolItems",
                column: "DrugId");

            migrationBuilder.CreateIndex(
                name: "IX_Drugs_CategoryId_SubCategoryId",
                table: "Drugs",
                columns: new[] { "CategoryId", "SubCategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_Drugs_SubCategoryId_CategoryId",
                table: "Drugs",
                columns: new[] { "SubCategoryId", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_SubCategories_CategoryId",
                table: "SubCategories",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Drugs_Categories_CategoryId",
                table: "Drugs",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Drugs_SubCategories_SubCategoryId_CategoryId",
                table: "Drugs",
                columns: new[] { "SubCategoryId", "CategoryId" },
                principalTable: "SubCategories",
                principalColumns: new[] { "Id", "CategoryId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ProtocolItems_Drugs_DrugId",
                table: "ProtocolItems",
                column: "DrugId",
                principalTable: "Drugs",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Drugs_Categories_CategoryId",
                table: "Drugs");

            migrationBuilder.DropForeignKey(
                name: "FK_Drugs_SubCategories_SubCategoryId_CategoryId",
                table: "Drugs");

            migrationBuilder.DropForeignKey(
                name: "FK_ProtocolItems_Drugs_DrugId",
                table: "ProtocolItems");

            migrationBuilder.DropTable(
                name: "SubCategories");

            migrationBuilder.DropTable(
                name: "Categories");

            migrationBuilder.DropIndex(
                name: "IX_ProtocolItems_DrugId",
                table: "ProtocolItems");

            migrationBuilder.DropIndex(
                name: "IX_Drugs_CategoryId_SubCategoryId",
                table: "Drugs");

            migrationBuilder.DropIndex(
                name: "IX_Drugs_SubCategoryId_CategoryId",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "ActiveIngredients",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "IsWithdrawn",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "NameAr",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "SearchOther",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "SubCategoryId",
                table: "Drugs");

            migrationBuilder.DropColumn(
                name: "WithdrawnAt",
                table: "Drugs");

            // No default: on a database holding shared drugs (ClinicId null) this fails and the migration rolls back
            migrationBuilder.AlterColumn<int>(
                name: "ClinicId",
                table: "Drugs",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Staff",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"FullName\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldDefaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Protocols",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldDefaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Drugs",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldDefaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "SearchName",
                table: "Clinics",
                type: "text",
                nullable: false,
                computedColumnSql: "translate(lower(\"Name\"), U&'\\0623\\0625\\0622\\0671\\0670\\0649\\0629\\0624\\0626\\0640\\064B\\064C\\064D\\064E\\064F\\0650\\0651\\0652\\0653\\0654\\0655\\0656\\0657\\0658\\0659\\065A\\065B\\065C\\065D\\065E\\065F', U&'\\0627\\0627\\0627\\0627\\0627\\064A\\0647\\0648\\064A')",
                stored: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldDefaultValue: "");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Drugs_Id_ClinicId",
                table: "Drugs",
                columns: new[] { "Id", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProtocolItems_DrugId_ClinicId",
                table: "ProtocolItems",
                columns: new[] { "DrugId", "ClinicId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ProtocolItems_Drugs_DrugId_ClinicId",
                table: "ProtocolItems",
                columns: new[] { "DrugId", "ClinicId" },
                principalTable: "Drugs",
                principalColumns: new[] { "Id", "ClinicId" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
