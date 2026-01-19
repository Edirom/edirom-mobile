#!/bin/sh

# Define the output file
CONFIG_FILE="/usr/share/nginx/html/env-config.js"

echo "Generating $CONFIG_FILE from environment variables..."

# Start the JS object - DIRECTLY assigning to window.config
echo "window.config = {" > "$CONFIG_FILE"


# Add any environment variable starting with APP_
# We use awk to safely format the key-value pairs
# JSON values (starting with { or [) are output as-is, others are quoted strings
printenv | grep '^APP_' | awk -F= '{
    key = $1
    # Join all remaining parts as value in case value contains =
    $1=""
    value = substr($0, 2)
    # Check if value looks like JSON (starts with { or [)
    if (match(value, /^[[:space:]]*[\{\[]/)) {
        print "  " key ": " value ","
    } else {
        print "  " key ": \"" value "\","
    }
}' >> "$CONFIG_FILE"

# Close the JS object
echo "};" >> "$CONFIG_FILE"

# Execute the main command (nginx)
exec "$@"
