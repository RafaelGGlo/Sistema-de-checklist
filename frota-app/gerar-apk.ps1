$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not $env:JAVA_HOME) {
  $javaAndroidStudio = 'C:\Program Files\Android\Android Studio\jbr'
  if (Test-Path -LiteralPath "$javaAndroidStudio\bin\java.exe") {
    $env:JAVA_HOME = $javaAndroidStudio
  } else { throw 'Configure JAVA_HOME com o JDK do Android Studio.' }
}
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'SDK Android nao encontrado.' }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:NODE_ENV = 'production'

# Preserve the signing key when prebuild regenerates Android.
$pastaAssinatura = Join-Path $PSScriptRoot '.ci-secrets'
$chaveSalva = Join-Path $pastaAssinatura 'debug.keystore'
if (Test-Path -LiteralPath 'android\app\debug.keystore') {
  New-Item -ItemType Directory -Force -Path $pastaAssinatura | Out-Null
  Copy-Item -LiteralPath 'android\app\debug.keystore' -Destination $chaveSalva -Force
}
& npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o Android.' }
if (Test-Path -LiteralPath $chaveSalva) {
  Copy-Item -LiteralPath $chaveSalva -Destination 'android\app\debug.keystore' -Force
}

Push-Location -LiteralPath 'android'
try {
  # Merge native stderr inside cmd so Windows PowerShell does not turn Java
  # compiler warnings into terminating NativeCommandError exceptions.
  & cmd /d /c 'gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m" --max-workers=2 --console=plain 2>&1'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o APK.' }
} finally { Pop-Location }

$pastaApk = Join-Path $PSScriptRoot 'apk'
New-Item -ItemType Directory -Force -Path $pastaApk | Out-Null
Copy-Item -LiteralPath 'android\app\build\outputs\apk\release\app-release.apk' -Destination (Join-Path $pastaApk 'Frota-Junco.apk') -Force
Write-Host "APK gerado em: $pastaApk\Frota-Junco.apk"
