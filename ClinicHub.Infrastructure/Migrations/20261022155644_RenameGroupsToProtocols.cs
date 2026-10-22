using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicHub.Infrastructure.Migrations
{
    /// <summary>
    /// Renames drug groups to protocols (M1.7a, design D10): tables, column, keys, indexes and identity sequences are
    /// renamed in place (no drop/create, so the data and ids are kept), then the stored permission keys
    /// <c>groups.*</c> become <c>protocols.*</c>. Down reverses the renames in the opposite order, then the keys.
    /// </summary>
    public partial class RenameGroupsToProtocols : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Protocols (was DrugGroups). Renaming a PK or AK constraint also renames its index.
            migrationBuilder.RenameTable(name: "DrugGroups", newName: "Protocols");
            migrationBuilder.Sql("""ALTER TABLE "Protocols" RENAME CONSTRAINT "PK_DrugGroups" TO "PK_Protocols";""");
            migrationBuilder.Sql("""ALTER TABLE "Protocols" RENAME CONSTRAINT "AK_DrugGroups_Id_ClinicId" TO "AK_Protocols_Id_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "Protocols" RENAME CONSTRAINT "FK_DrugGroups_Clinics_ClinicId" TO "FK_Protocols_Clinics_ClinicId";""");
            migrationBuilder.RenameIndex(name: "IX_DrugGroups_ClinicId_Name", table: "Protocols", newName: "IX_Protocols_ClinicId_Name");
            migrationBuilder.Sql("""ALTER SEQUENCE "DrugGroups_Id_seq" RENAME TO "Protocols_Id_seq";""");

            // ProtocolItems (was DrugGroupItems).
            migrationBuilder.RenameTable(name: "DrugGroupItems", newName: "ProtocolItems");
            migrationBuilder.RenameColumn(name: "DrugGroupId", table: "ProtocolItems", newName: "ProtocolId");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "PK_DrugGroupItems" TO "PK_ProtocolItems";""");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "FK_DrugGroupItems_Clinics_ClinicId" TO "FK_ProtocolItems_Clinics_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "FK_DrugGroupItems_DrugGroups_DrugGroupId_ClinicId" TO "FK_ProtocolItems_Protocols_ProtocolId_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "FK_DrugGroupItems_Drugs_DrugId_ClinicId" TO "FK_ProtocolItems_Drugs_DrugId_ClinicId";""");
            migrationBuilder.RenameIndex(name: "IX_DrugGroupItems_ClinicId", table: "ProtocolItems", newName: "IX_ProtocolItems_ClinicId");
            migrationBuilder.RenameIndex(name: "IX_DrugGroupItems_DrugGroupId_ClinicId", table: "ProtocolItems", newName: "IX_ProtocolItems_ProtocolId_ClinicId");
            migrationBuilder.RenameIndex(name: "IX_DrugGroupItems_DrugId_ClinicId", table: "ProtocolItems", newName: "IX_ProtocolItems_DrugId_ClinicId");
            migrationBuilder.Sql("""ALTER SEQUENCE "DrugGroupItems_Id_seq" RENAME TO "ProtocolItems_Id_seq";""");

            // Stored permission keys of every role (every clinic, deleted ones and the template included).
            migrationBuilder.Sql("""UPDATE "RolePermissions" SET "Permission" = 'protocols.' || substr("Permission", 8) WHERE "Permission" LIKE 'groups.%';""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER SEQUENCE "ProtocolItems_Id_seq" RENAME TO "DrugGroupItems_Id_seq";""");
            migrationBuilder.RenameIndex(name: "IX_ProtocolItems_DrugId_ClinicId", table: "ProtocolItems", newName: "IX_DrugGroupItems_DrugId_ClinicId");
            migrationBuilder.RenameIndex(name: "IX_ProtocolItems_ProtocolId_ClinicId", table: "ProtocolItems", newName: "IX_DrugGroupItems_DrugGroupId_ClinicId");
            migrationBuilder.RenameIndex(name: "IX_ProtocolItems_ClinicId", table: "ProtocolItems", newName: "IX_DrugGroupItems_ClinicId");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "FK_ProtocolItems_Drugs_DrugId_ClinicId" TO "FK_DrugGroupItems_Drugs_DrugId_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "FK_ProtocolItems_Protocols_ProtocolId_ClinicId" TO "FK_DrugGroupItems_DrugGroups_DrugGroupId_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "FK_ProtocolItems_Clinics_ClinicId" TO "FK_DrugGroupItems_Clinics_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "ProtocolItems" RENAME CONSTRAINT "PK_ProtocolItems" TO "PK_DrugGroupItems";""");
            migrationBuilder.RenameColumn(name: "ProtocolId", table: "ProtocolItems", newName: "DrugGroupId");
            migrationBuilder.RenameTable(name: "ProtocolItems", newName: "DrugGroupItems");

            migrationBuilder.Sql("""ALTER SEQUENCE "Protocols_Id_seq" RENAME TO "DrugGroups_Id_seq";""");
            migrationBuilder.RenameIndex(name: "IX_Protocols_ClinicId_Name", table: "Protocols", newName: "IX_DrugGroups_ClinicId_Name");
            migrationBuilder.Sql("""ALTER TABLE "Protocols" RENAME CONSTRAINT "FK_Protocols_Clinics_ClinicId" TO "FK_DrugGroups_Clinics_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "Protocols" RENAME CONSTRAINT "AK_Protocols_Id_ClinicId" TO "AK_DrugGroups_Id_ClinicId";""");
            migrationBuilder.Sql("""ALTER TABLE "Protocols" RENAME CONSTRAINT "PK_Protocols" TO "PK_DrugGroups";""");
            migrationBuilder.RenameTable(name: "Protocols", newName: "DrugGroups");

            migrationBuilder.Sql("""UPDATE "RolePermissions" SET "Permission" = 'groups.' || substr("Permission", 11) WHERE "Permission" LIKE 'protocols.%';""");
        }
    }
}
