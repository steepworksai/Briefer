#!/usr/bin/env bash
# Launches a 4-pane tmux session for the QuickRead agent system.
#
# Layout (4 vertical columns):
#   ┌──────────┬──────────┬──────────┬──────────┐
#   │          │          │          │          │
#   │ ORCHESTR │ DEBUGGER │ARCHITECT │DOCUMENT. │
#   │          │          │          │          │
#   └──────────┴──────────┴──────────┴──────────┘

SESSION="quickread-agents"
WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null

# Create session with a wide window: pane 0 = ORCHESTRATOR
tmux new-session -d -s "$SESSION" -c "$WORKDIR" -x 220 -y 50

# Add 3 more vertical splits to the right
tmux split-window -h -t "$SESSION:0.0" -c "$WORKDIR"   # pane 1: DEBUGGER
tmux split-window -h -t "$SESSION:0.1" -c "$WORKDIR"   # pane 2: ARCHITECT
tmux split-window -h -t "$SESSION:0.2" -c "$WORKDIR"   # pane 3: DOCUMENTER

# Even out column widths
tmux select-layout -t "$SESSION" even-horizontal

# Name panes
tmux select-pane -t "$SESSION:0.0" -T "ORCHESTRATOR"
tmux select-pane -t "$SESSION:0.1" -T "DEBUGGER"
tmux select-pane -t "$SESSION:0.2" -T "ARCHITECT"
tmux select-pane -t "$SESSION:0.3" -T "DOCUMENTER"

# Enable pane border titles
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "

# Start claude in all 4 panes (unset CLAUDECODE to allow nested instances)
tmux send-keys -t "$SESSION:0.0" "unset CLAUDECODE && claude" Enter
tmux send-keys -t "$SESSION:0.1" "unset CLAUDECODE && claude" Enter
tmux send-keys -t "$SESSION:0.2" "unset CLAUDECODE && claude" Enter
tmux send-keys -t "$SESSION:0.3" "unset CLAUDECODE && claude" Enter

# Wait for each pane to show a prompt before injecting role context
wait_for_prompt() {
  local pane="$1"
  local max=60
  local i=0
  echo -n "  Waiting for pane $pane..."
  while [ $i -lt $max ]; do
    if tmux capture-pane -t "$pane" -p | grep -qE "❯|>\s*$"; then
      echo " ready."
      return 0
    fi
    sleep 1
    i=$((i+1))
  done
  echo " timed out (injecting anyway)."
}

echo "Waiting for Claude to start in all panes..."
wait_for_prompt "$SESSION:0.0"
wait_for_prompt "$SESSION:0.1"
wait_for_prompt "$SESSION:0.2"
wait_for_prompt "$SESSION:0.3"

# Inject role context into each pane
tmux send-keys -t "$SESSION:0.0" \
  "Read agents/roles/orchestrator.md and operate as the Orchestrator from now on. Briefly confirm your role and wait for me to give you the first task to dispatch." \
  Enter

tmux send-keys -t "$SESSION:0.1" \
  "Read agents/roles/debugger.md and operate as the Debugger from now on. Briefly confirm your role, then check agents/workspace/tasks/debugger.md for tasks (it may not exist yet — just wait if so)." \
  Enter

tmux send-keys -t "$SESSION:0.2" \
  "Read agents/roles/architect.md and operate as the Architect from now on. Briefly confirm your role, then check agents/workspace/tasks/architect.md for tasks (it may not exist yet — just wait if so)." \
  Enter

tmux send-keys -t "$SESSION:0.3" \
  "Read agents/roles/documenter.md and operate as the Documenter from now on. Briefly confirm your role, then check agents/workspace/tasks/documenter.md for tasks (it may not exist yet — just wait if so)." \
  Enter

# Focus on orchestrator pane
tmux select-pane -t "$SESSION:0.0"

echo ""
echo "Session '$SESSION' is ready."
echo "Attach with:  tmux attach -t $SESSION"
