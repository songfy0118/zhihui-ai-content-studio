param(
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ImagePath = Join-Path $ProjectRoot "public\pilots\xiaozhang-host-v1.png"
$OutputRoot = Join-Path $ProjectRoot "outputs\hosted-science-ep01"
$AssPath = Join-Path $OutputRoot "captions.ass"
$VideoPath = Join-Path $OutputRoot "hosted-science-ep01-roughcut.mp4"
$FontPath = "C:\Windows\Fonts\msyh.ttc"
$Ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) { throw "Host image is missing: $ImagePath" }
if (-not (Test-Path -LiteralPath $FontPath -PathType Leaf)) { throw "Required Chinese font is missing: $FontPath" }

$Plan = [ordered]@{
  mode = if ($Execute) { "execution_requested" } else { "plan_only" }
  mutationPerformed = $false
  title = "章鱼真的有9个大脑吗？"
  durationSeconds = 42
  output = $VideoPath
  editRules = @(
    "0-3 秒反常识问题作钩子",
    "每 5-8 秒切换一个信息层",
    "核心名词以青色强调，其余字幕保持白色",
    "只使用轻微推拉和淡入淡出，不堆叠花哨转场",
    "结尾留下一个评论问题"
  )
  audio = "无旁白视觉粗剪；CosyVoice 可用后替换为旁白与同步提示音"
}

if (-not $Execute) {
  $Plan | ConvertTo-Json -Depth 5
  exit 0
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$Ass = @"
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Hook,Microsoft YaHei,88,&H00FFFFFF,&H000000FF,&H0013264A,&H92000000,1,0,0,0,100,100,2,0,1,4,1,8,80,80,1480,1
Style: Body,Microsoft YaHei,58,&H00FFFFFF,&H000000FF,&H0013264A,&H8A000000,0,0,0,0,100,100,1,0,1,3,1,8,85,85,1490,1
Style: Accent,Microsoft YaHei,62,&H00D6F8FF,&H000000FF,&H0013264A,&H8A000000,1,0,0,0,100,100,1,0,1,3,1,8,85,85,1490,1
Style: CTA,Microsoft YaHei,50,&H00FFFFFF,&H000000FF,&H0013264A,&H8A000000,0,0,0,0,100,100,1,0,1,2,1,8,85,85,165,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:00.00,0:00:03.20,Hook,,0,0,0,,章鱼真的有 9 个大脑？
Dialogue: 0,0:00:03.20,0:00:08.50,Body,,0,0,0,,不是。它有 1 个中央脑。
Dialogue: 0,0:00:08.50,0:00:15.50,Accent,,0,0,0,,但它的神经系统，高度分布。
Dialogue: 0,0:00:15.50,0:00:23.00,Body,,0,0,0,,大量神经元分布在八条腕足里。
Dialogue: 0,0:00:23.00,0:00:30.00,Accent,,0,0,0,,腕足能处理部分感觉和运动。
Dialogue: 0,0:00:30.00,0:00:37.00,Body,,0,0,0,,这不等于八条腕足各有一个脑。
Dialogue: 0,0:00:37.00,0:00:42.00,CTA,,0,0,0,,你还听过哪些动物传言？
"@

Set-Content -LiteralPath $AssPath -Value $Ass -Encoding UTF8
$FfmpegAssPath = ($AssPath -replace "\\", "/") -replace ":", "\:"

& $Ffmpeg -y -loop 1 -framerate 30 -i $ImagePath -f lavfi -i "aevalsrc=0.018*sin(2*PI*110*t)+0.008*sin(2*PI*220*t):s=48000:d=42" -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.00035,1.12)':d=1:s=1080x1920:fps=30,eq=contrast=1.06:saturation=0.9,fade=t=in:st=0:d=0.45,fade=t=out:st=41.5:d=0.5,ass='$FfmpegAssPath'[v]" -map "[v]" -map 1:a -t 42 -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 128k $VideoPath
if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed to create the hosted science rough cut." }

$Plan.mode = "executed"
$Plan.mutationPerformed = $true
$Plan | ConvertTo-Json -Depth 5
