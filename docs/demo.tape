# Re-record the hero GIF with vhs (https://github.com/charmbracelet/vhs):
#   cd docs && vhs demo.tape
# Assumes `engram` is on PATH and a ./notes folder with the three example
# notes from ../examples/notes (re-date the "hiring" note into the current
# week so the --since beat reads correctly).
Output demo.gif

Set FontSize 17
Set Width 1100
Set Height 560
Set Theme "Catppuccin Mocha"
Set Padding 12
Set TypingSpeed 35ms

Hide
Type "export ENGRAM_STORE=./.store.json PS1='$ ' && rm -f ./.store.json && clear"
Enter
Show

Type "# your notes -> a private, searchable memory. 100% local."
Sleep 900ms
Enter
Type "engram ingest ./notes"
Sleep 300ms
Enter
Sleep 3s

Type "engram recall "
Type `"what did I decide about pricing"`
Sleep 300ms
Enter
Sleep 2.6s

Type "# time is first-class"
Sleep 700ms
Enter
Type "engram recall "
Type `"what did I decide about pricing"`
Type " --since week"
Sleep 300ms
Enter
Sleep 2s

Type "# and it self-evolves: confirm the answer, recall gets sharper"
Sleep 900ms
Enter
Type "engram reinforce "
Type `"what did I decide about pricing"`
Type " pricing"
Sleep 300ms
Enter
Sleep 1.6s
Type "engram recall "
Type `"what did I decide about pricing"`
Sleep 300ms
Enter
Sleep 4s
