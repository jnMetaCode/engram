# Re-record the hero GIF with vhs (https://github.com/charmbracelet/vhs):
#
#   cd docs && vhs demo.tape
#
# Assumes `engram` is on PATH (npm i -g, or a shim to src/cli.js) and a ./notes
# folder with the three example notes from ../examples/notes (re-date the
# "hiring" note inside the current week so the --since beat reads correctly).
Output demo.gif

Set FontSize 17
Set Width 1100
Set Height 540
Set Theme "Catppuccin Mocha"
Set Padding 12
Set TypingSpeed 35ms

Hide
Type "export PS1='$ ' ENGRAM_STORE=./.store.json && rm -f ./.store.json && clear"
Enter
Show

Type "# your notes -> a private, searchable memory. 100% local."
Sleep 900ms
Enter
Type "engram ingest ./notes"
Sleep 300ms
Enter
Sleep 1.4s

Type "engram recall "
Type `"what did I decide about pricing"`
Sleep 300ms
Enter
Sleep 2.8s

Type "# every memory has a date — time is first-class"
Sleep 800ms
Enter
Type "engram recall "
Type `"what did I decide about pricing"`
Type " --since week"
Sleep 300ms
Enter
Sleep 2.2s

Type "engram recall "
Type `"auth bug clock skew"`
Type " --since week"
Sleep 300ms
Enter
Sleep 4s
