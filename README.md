# context-meter

A Claude Code plugin that adds one compact figure to the prompt footer, beside the mode labels:

```
135tok/s 18.2M(98.71%) 28%
```

Decode speed, all tokens sent and received with the prompt cache hit rate, and the context window fill. Point at it and three cards show above the prompt; move away and they hide. (VS Code and the mobile app, which draw no footer figure, show a row of the figures above the prompt instead, each opening its card on a click, with × to close.)

- 用时与速度: turns, steps, LLM time, tool time (a permission prompt's wait counts), average time per step and to first token, decode speed.
- Token: total, input, cache reads and writes, output, cache hit rate.
- 上下文: tokens used and the window, then the window in four, each with a bar: 系统提示词 (the system prompt and memory files), 工具定义 (tool, agent, skill and command listings), 对话消息, and 剩余空间.

Totals count the session's main loop; `/clear` starts them over.

It updates after every model response. Before the first response of a session (or right after a compaction) it shows the window alone: `Context — / 200k`.

Works in the terminal and in the Claude desktop app's Code tab. Needs Claude Code 2.1.299 or newer.

## Install

At the prompt of a terminal session:

```
/plugin install context-meter --marketplace Swirlxx756/context-meter
```

Answer `y` to add the marketplace, then pick the user scope.

From a shell:

```
claude plugin install context-meter --marketplace Swirlxx756/context-meter
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Swirlxx756/context-meter`, then Add plugin.

The plugin shows up in each session started after the install.
