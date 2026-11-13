# Runs the Gradle wrapper for this project on this server.
# - JAVA_HOME: the JDK 21 that ships with the build tools on this machine.
# - PATH: this machine's PATH contains a stray double quote (after the cloudflared entry), which
#   splits the command line Gradle builds for the unit-test JVM ("Could not find or load main
#   class VS"). It is removed here, for the Gradle process only; the system setting is untouched.
param([Parameter(ValueFromRemainingArguments = $true)] $GradleArgs)
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:Path = $env:Path -replace '"', ''
Set-Location $PSScriptRoot
& .\gradlew.bat @GradleArgs --no-daemon -q
exit $LASTEXITCODE
