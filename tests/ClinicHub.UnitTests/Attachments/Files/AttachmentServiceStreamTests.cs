using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;
using static ClinicHub.UnitTests.Attachments.Files.AttachmentServiceHarness;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>Each step reads a fresh stream from its start (docs/design/attachments.md § 3, § 6: "re-openable, seekable").</summary>
[Trait("Area", "attachments")]
public class AttachmentServiceStreamTests
{
    /// <summary>Remembers where it stood when it was first read, and how much was read before the write got it.</summary>
    private sealed class TrackedStream(byte[] content) : MemoryStream(content)
    {
        public long? FirstReadAt { get; private set; }

        public override int Read(byte[] buffer, int offset, int count)
        {
            FirstReadAt ??= Position;
            return base.Read(buffer, offset, count);
        }

        public override int Read(Span<byte> buffer)
        {
            FirstReadAt ??= Position;
            return base.Read(buffer);
        }

        public override int ReadByte()
        {
            FirstReadAt ??= Position;
            return base.ReadByte();
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct)
        {
            FirstReadAt ??= Position;
            return base.ReadAsync(buffer, offset, count, ct);
        }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
        {
            FirstReadAt ??= Position;
            return base.ReadAsync(buffer, ct);
        }
    }

    [Theory]
    [Trait("Case", "ATT-130")]
    [InlineData("a.png", "png")]
    [InlineData("a.docx", "docx")]
    [InlineData("a.txt", "txt")]
    public async Task The_content_check_and_the_write_each_read_from_the_start_of_a_fresh_stream(string fileName, string typeKey)
    {
        var harness = new AttachmentServiceHarness();
        var content = AttachmentSamples.For(typeKey);
        var opened = new List<TrackedStream>();
        var upload = new AttachmentUpload(fileName, () =>
        {
            var stream = new TrackedStream(content);
            opened.Add(stream);
            return stream;
        });

        await harness.ShouldReachTheWrite(G, upload);

        var save = harness.Files.Saves.ShouldHaveSingleItem();
        var written = opened.Single(s => ReferenceEquals(s, save.Content));
        save.Position.ShouldBe(0, "the write starts at the stream's start");
        written.FirstReadAt.ShouldBeNull("the write's stream is fresh: nothing read it before the provider");

        var read = opened.Where(s => s.FirstReadAt is not null).ToList();
        read.ShouldNotBeEmpty("the content check read a stream of its own");
        read.ShouldAllBe(s => s.FirstReadAt == 0, "every read starts from the start");
    }
}
