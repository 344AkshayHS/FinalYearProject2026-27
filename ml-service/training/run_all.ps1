# Runs the whole retraining chain in one go, writing everything to artifacts/retrain.log.
#
# Use it when the training will take hours and you do not want to sit and watch it:
#   powershell -ExecutionPolicy Bypass -File training/run_all.ps1
#
# It needs no internet: every file it reads is already on this PC. The computer only has to
# stay awake (Settings > System > Power > Screen and sleep > "Never" while it runs).

# "Continue", not "Stop": Windows PowerShell 5.1 turns any warning Python prints (for example
# scikit-learn's ConvergenceWarning) into a fatal error. A step fails only on its exit code, below.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$python = ".\.venv\Scripts\python.exe"
$log = "artifacts\retrain.log"
$env:PYTHONUTF8 = "1"
$env:PYTHONUNBUFFERED = "1"        # so the log fills as it goes, not at the end

$steps = @(
    "training/train_location_model.py",   # the 7-model comparison; saves the winner
    "training/make_district_points.py",   # the points a hand-picked district is averaged over
    "training/calibration.py",            # probability vs real share, for "Strong / Good / Possible"
    "training/compare_taluk_labels.py",   # the weight of a picked taluk against its district
    "training/check_states.py",           # held-out accuracy per state and season
    "training/check_districts.py",        # all 30 districts, answered the way the app does
    "training/explain.py",                # SHAP vs LIME agreement per crop
    "training/taluk_season_crops.py",     # each taluk's field crops per season, to order its "to sow" list
    "training/export_recommendations.py"  # every Karnataka district and taluk, every season, for Excel
)

"=== started $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-File $log -Encoding utf8
foreach ($step in $steps) {
    "`n=== $step  ($(Get-Date -Format 'HH:mm'))" | Out-File $log -Append -Encoding utf8
    & $python $step *>&1 | Out-File $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        "=== $step FAILED with exit code $LASTEXITCODE - stopping here" | Out-File $log -Append -Encoding utf8
        exit $LASTEXITCODE
    }
}
"`n=== all steps finished $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-File $log -Append -Encoding utf8
