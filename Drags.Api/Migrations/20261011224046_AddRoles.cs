using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Drags.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddUniqueConstraint(
                name: "AK_Staff_Id_ClinicId",
                table: "Staff",
                columns: new[] { "Id", "ClinicId" });

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ClinicId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsOwner = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                    table.UniqueConstraint("AK_Roles_Id_ClinicId", x => new { x.Id, x.ClinicId });
                    table.ForeignKey(
                        name: "FK_Roles_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RolePermissions",
                columns: table => new
                {
                    RoleId = table.Column<int>(type: "integer", nullable: false),
                    Permission = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RolePermissions", x => new { x.RoleId, x.Permission });
                    table.ForeignKey(
                        name: "FK_RolePermissions_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StaffRoles",
                columns: table => new
                {
                    StaffId = table.Column<int>(type: "integer", nullable: false),
                    RoleId = table.Column<int>(type: "integer", nullable: false),
                    ClinicId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffRoles", x => new { x.StaffId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_StaffRoles_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StaffRoles_Roles_RoleId_ClinicId",
                        columns: x => new { x.RoleId, x.ClinicId },
                        principalTable: "Roles",
                        principalColumns: new[] { "Id", "ClinicId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StaffRoles_Staff_StaffId_ClinicId",
                        columns: x => new { x.StaffId, x.ClinicId },
                        principalTable: "Staff",
                        principalColumns: new[] { "Id", "ClinicId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Roles_ClinicId_Name",
                table: "Roles",
                columns: new[] { "ClinicId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Roles_ClinicId_Owner",
                table: "Roles",
                column: "ClinicId",
                unique: true,
                filter: "\"IsOwner\"");

            migrationBuilder.CreateIndex(
                name: "IX_StaffRoles_ClinicId",
                table: "StaffRoles",
                column: "ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffRoles_RoleId_ClinicId",
                table: "StaffRoles",
                columns: new[] { "RoleId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_StaffRoles_StaffId_ClinicId",
                table: "StaffRoles",
                columns: new[] { "StaffId", "ClinicId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RolePermissions");

            migrationBuilder.DropTable(
                name: "StaffRoles");

            migrationBuilder.DropTable(
                name: "Roles");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Staff_Id_ClinicId",
                table: "Staff");
        }
    }
}
