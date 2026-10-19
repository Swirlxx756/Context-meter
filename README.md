# context-meter

A Claude Code plugin that shows the live context window usage in the prompt footer, beside the mode labels:

```
Context 42% · 84k / 200k
```

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
