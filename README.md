# context-meter

A Claude Code plugin that adds one compact row above the prompt, right-aligned:

```
132tok/s 3.5M tok(96.12%) 19%
```

Decode speed, all tokens sent and received with the prompt cache hit rate, and the context window fill. Before the first response it shows the fill alone (`—` until one lands).

Click it to open a card above it with everything; click it again, or ×, to close:

- 用时与速度: turns, steps, LLM time, tool time (a permission prompt's wait counts), average time per step and to first token, decode speed.
- Token: total, input, cache reads and writes, output, cache hit rate.
- 上下文: tokens used and the window, the model, and the window by category as `/context` breaks it down.

The desktop app draws an icon beside each heading and a bar beside each category. Totals count the session's main loop; `/clear` starts them over.

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
