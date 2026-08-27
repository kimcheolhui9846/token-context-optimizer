export interface ParsedStdoutMessages {
  messages: unknown[];
  consumedLines: number;
}

export function parseCompleteJsonMessages(input: {
  buffer: string;
  consumedLines: number;
}): ParsedStdoutMessages {
  const split = input.buffer.split(/\r?\n/u);
  const completeLines = input.buffer.endsWith("\n") || input.buffer.endsWith("\r")
    ? split.filter((line) => line.length > 0)
    : split.slice(0, -1).filter((line) => line.length > 0);
  const messages: unknown[] = [];

  for (const line of completeLines.slice(input.consumedLines)) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      throw new Error(`Malformed MCP stdout line: ${line}`);
    }
  }

  return {
    messages,
    consumedLines: completeLines.length,
  };
}
