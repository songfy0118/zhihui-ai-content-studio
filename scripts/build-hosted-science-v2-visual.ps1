param(
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$OutputRoot = Join-Path $ProjectRoot "outputs\hosted-science-ep01-v2"
$AssPath = Join-Path $OutputRoot "captions.ass"
$VideoPath = Join-Path $OutputRoot "hosted-science-ep01-v2-visual.mp4"
$FontPath = "C:\Windows\Fonts\msyh.ttc"
$Ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$Sources = @(
  (Join-Path $ProjectRoot "public\pilots\xiaozhang-host-v1.png"),
  (Join-Path $ProjectRoot "public\pilots\octopus-nervous-system-v1.png"),
  (Join-Path $ProjectRoot "public\pilots\octopus-three-hearts-v1.png"),
  (Join-Path $ProjectRoot "public\pilots\octopus-lab-multitask-v1.png")
)

foreach ($Source in $Sources) {
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Required visual is missing: $Source" }
}
if (-not (Test-Path -LiteralPath $FontPath -PathType Leaf)) { throw "Required Chinese font is missing: $FontPath" }

$Plan = [ordered]@{
  mode = if ($Execute) { "execution_requested" } else { "plan_only" }
  mutationPerformed = $false
  title = "章鱼真的有9个大脑吗？ v2 visual assembly"
  durationSeconds = 42
  output = $VideoPath
  segments = @(
    "0-6s: host hook and question",
    "6-18s: distributed nervous-system diagram",
    "18-29s: three-heart diagram",
    "29-42s: eight-arm multitasking metaphor and CTA"
  )
  deliberatelyDeferred = @("CosyVoice narration", "licensed music and sound effects chosen in Jianying", "human review before export or publishing")
}
if (-not $Execute) { $Plan | ConvertTo-Json -Depth 5; exit 0 }

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$Ass = @(
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', 'ScaledBorderAndShadow: yes', '',
  '[V4+ Styles]',
  'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
  'Style: Hook,Microsoft YaHei,88,&H00FFFFFF,&H000000FF,&H0013264A,&H92000000,1,0,0,0,100,100,2,0,1,4,1,8,80,80,1480,1',
  'Style: Body,Microsoft YaHei,58,&H00FFFFFF,&H000000FF,&H0013264A,&H8A000000,0,0,0,0,100,100,1,0,1,3,1,8,85,85,1490,1',
  'Style: Accent,Microsoft YaHei,62,&H00D6F8FF,&H000000FF,&H0013264A,&H8A000000,1,0,0,0,100,100,1,0,1,3,1,8,85,85,1490,1',
  'Style: CTA,Microsoft YaHei,50,&H00FFFFFF,&H000000FF,&H0013264A,&H8A000000,0,0,0,0,100,100,1,0,1,2,1,8,85,85,165,1', '',
  '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
  'Dialogue: 0,0:00:00.00,0:00:03.00,Hook,,0,0,0,,章鱼真的有 9 个大脑？',
  'Dialogue: 0,0:00:03.00,0:00:06.00,Body,,0,0,0,,答案没那么简单。',
  'Dialogue: 0,0:00:06.00,0:00:12.00,Accent,,0,0,0,,它有 1 个中央脑。',
  'Dialogue: 0,0:00:12.00,0:00:18.00,Body,,0,0,0,,但大量神经元分布在八条腕足里。',
  'Dialogue: 0,0:00:18.00,0:00:24.00,Accent,,0,0,0,,它还有 3 颗心脏。',
  'Dialogue: 0,0:00:24.00,0:00:29.00,Body,,0,0,0,,两颗为鳃供血，一颗输送全身。',
  'Dialogue: 0,0:00:29.00,0:00:36.00,Accent,,0,0,0,,腕足能处理部分感觉和运动。',
  'Dialogue: 0,0:00:36.00,0:00:42.00,CTA,,0,0,0,,这不等于它有 9 个独立大脑。你还想拆解什么传言？'
) -join "`r`n"
Set-Content -LiteralPath $AssPath -Value $Ass -Encoding UTF8
$FfmpegAssPath = ($AssPath -replace "\\", "/") -replace ":", "\:"

& $Ffmpeg -y `
  -loop 1 -framerate 30 -t 6 -i $Sources[0] `
  -loop 1 -framerate 30 -t 12 -i $Sources[1] `
  -loop 1 -framerate 30 -t 11 -i $Sources[2] `
  -loop 1 -framerate 30 -t 13 -i $Sources[3] `
  -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0007,1.10)':d=1:s=1080x1920:fps=30,trim=duration=6,setpts=PTS-STARTPTS[a];[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.00045,1.12)':d=1:s=1080x1920:fps=30,trim=duration=12,setpts=PTS-STARTPTS[b];[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.00045,1.12)':d=1:s=1080x1920:fps=30,trim=duration=11,setpts=PTS-STARTPTS[c];[3:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.00055,1.12)':d=1:s=1080x1920:fps=30,trim=duration=13,setpts=PTS-STARTPTS[d];[a][b][c][d]concat=n=4:v=1:a=0,fade=t=in:st=0:d=0.35,fade=t=out:st=41.5:d=0.5,ass='$FfmpegAssPath'[v]" `
  -map "[v]" -t 42 -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p $VideoPath
if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed to create the v2 visual assembly." }

$Plan.mode = "executed"
$Plan.mutationPerformed = $true
$Plan | ConvertTo-Json -Depth 5
