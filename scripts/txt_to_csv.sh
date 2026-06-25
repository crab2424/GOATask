#!/bin/sh

set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 input.txt [output.csv]" >&2
  exit 1
fi

input=$1
output=${2:-}

if [ ! -f "$input" ]; then
  echo "Error: input file not found: $input" >&2
  exit 1
fi

convert() {
  awk '
function csv_escape(s) {
  gsub(/\r$/, "", s)
  gsub(/"/, "\"\"", s)
  return "\"" s "\""
}
NR % 2 == 1 {
  left = $0
  next
}
{
  print csv_escape(left) "," csv_escape($0)
  left = ""
}
END {
  if (NR % 2 == 1) {
    print csv_escape(left) ","
  }
}
' "$input"
}

if [ -n "$output" ]; then
  convert > "$output"
else
  convert
fi
