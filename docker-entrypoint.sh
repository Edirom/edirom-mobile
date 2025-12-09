#!/bin/sh

# Define the output file
CONFIG_FILE="/usr/share/nginx/html/env-config.js"

echo "Generating $CONFIG_FILE from environment variables..."

# Start the JS object - DIRECTLY assigning to window.config
echo "window.config = {" > "$CONFIG_FILE"


# Add any environment variable starting with APP_
# We use awk to safely format the key-value pairs
printenv | grep '^APP_' | awk -F= '{
    key = $1
    # Join all remaining parts as value in case value contains =
    $1=""
    value = substr($0, 2) 
    print "  " key ": \"" value "\","
}' >> "$CONFIG_FILE"

# Close the JS object
echo "};" >> "$CONFIG_FILE"

# Execute the main command (nginx)
exec "$@"
