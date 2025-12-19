// SSE route: /api/sse/hello-world
// Streams "Hello World!" one character at a time using Server-Sent Events (SSE).

export async function GET(req: Request) {
  const text = 'Hello World!';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let i = 0;
      let aborted = false;

      // Close the stream if the client disconnects
      if (req.signal) {
        req.signal.addEventListener('abort', () => {
          aborted = true;
          try {
            controller.close();
          } catch (e) {
            // ignore
          }
        });
      }

      // async push loop
      (async () => {
        try {
          for (; i < text.length; i++) {
            if (aborted) return;
            const ch = text[i];
            // Each SSE message must end with a blank line
            controller.enqueue(encoder.encode(`data: ${ch}\n\n`));
            // small delay between characters
            await new Promise((res) => setTimeout(res, 120));
          }

          if (aborted) return;
          // send a final sentinel event and close
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      })();
    },
    cancel() {
      // called if the consumer cancels the stream
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

