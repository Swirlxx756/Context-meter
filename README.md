# context-meter

A Claude Code plugin that adds a row of session figures to the hint line under the prompt:

```
◷ 4 轮·48 步 · 215 tok/s   ⛁ 3.6M tok · 缓存命中 94.01%   ◔ Context 42% · 84k / 200k
```

Turns and model steps with decode speed; all tokens sent and received with the prompt cache hit rate; the context window fill. The desktop app draws the icons as vector images (the ring fills with the context and turns red past 80%); the terminal draws the glyphs above. Before the first response the row shows the window alone.

Point at a figure and its card shows above the prompt; move away and it hides. (VS Code and the mobile app, which raise no hint line, draw the row above the prompt and open a card on a click, with × to close.)

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
