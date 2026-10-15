// The run's databases, the shuffled order (CLINICHUB_TEST_SEED) and parallel collections (one database copy each)
[assembly: TestFramework("ClinicHub.IntegrationTests.Harness.Running.IntegrationTestFramework", "ClinicHub.IntegrationTests")]
[assembly: TestCaseOrderer("ClinicHub.IntegrationTests.Harness.Running.SeededTestCaseOrderer", "ClinicHub.IntegrationTests")]
[assembly: TestCollectionOrderer("ClinicHub.IntegrationTests.Harness.Running.SeededCollectionOrderer", "ClinicHub.IntegrationTests")]
[assembly: CollectionBehavior(CollectionBehavior.CollectionPerClass, DisableTestParallelization = false)]
