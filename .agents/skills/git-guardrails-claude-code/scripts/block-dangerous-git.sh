#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

read -r -a TOKENS <<< "$COMMAND"

block() {
  echo "BLOCKED: '$COMMAND' contains dangerous git operation '$1'. The user has prevented you from doing this." >&2
  exit 2
}

for ((git_index = 0; git_index < ${#TOKENS[@]}; git_index += 1)); do
  [[ "${TOKENS[git_index]}" == "git" ]] || continue

  command_index=$((git_index + 1))
  while ((command_index < ${#TOKENS[@]})); do
    token="${TOKENS[command_index]}"
    case "$token" in
      -C|-c|--git-dir|--work-tree|--namespace|--super-prefix|--config-env|--exec-path)
        command_index=$((command_index + 2))
        ;;
      --git-dir=*|--work-tree=*|--namespace=*|--super-prefix=*|--config-env=*|--exec-path=*|--bare|--no-replace-objects|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--paginate|--no-pager)
        command_index=$((command_index + 1))
        ;;
      *) break ;;
    esac
  done

  ((command_index < ${#TOKENS[@]})) || continue
  subcommand="${TOKENS[command_index]}"
  arguments=" ${TOKENS[*]:command_index+1} "

  case "$subcommand" in
    push) block "git push" ;;
    reset)
      [[ "$arguments" == *" --hard "* ]] && block "git reset --hard"
      ;;
    clean)
      [[ "$arguments" =~ [[:space:]]-[a-zA-Z]*f[a-zA-Z]*[[:space:]] ]] && block "git clean -f"
      ;;
    branch)
      [[ "$arguments" == *" -D "* ]] && block "git branch -D"
      ;;
    checkout|restore)
      [[ "$arguments" == *" . "* ]] && block "git $subcommand ."
      ;;
  esac
done

if [[ "$COMMAND" =~ (^|[[:space:]])(push[[:space:]]+--force|reset[[:space:]]+--hard)($|[[:space:]]) ]]; then
    echo "BLOCKED: '$COMMAND' matches a dangerous delegated git operation. The user has prevented you from doing this." >&2
    exit 2
fi

exit 0
