# context-meter

A Claude Code plugin that adds session figures to the prompt footer, beside the mode labels:

```
◷ 4 轮·48 步 · 215 tok/s   ⛁ 3.6M tok · 缓存 94.01%   ◔ 42%
```

Turns and model steps with decode speed, all tokens sent and received with the prompt cache hit rate, and the context window fill, rightmost. The desktop app draws the icons as vector images (the ring fills with the context and turns red past 80%); the terminal draws the glyphs above.

Click a figure for its floating card above the footer; click it again, or ×, to close:

- the timings card: turns, steps, LLM time, tool time (a permission prompt's wait counts), average time per step and to first token, decode speed, and the token split (input, cache reads and writes, output).
- the context card: tokens used and the window, the model, and the window by category as `/context` breaks it down.

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
