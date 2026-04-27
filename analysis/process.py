import json
import os
import subprocess
from tqdm import tqdm
import time

RAW_VIDEO_DIR = "raw_videos"
FRAME_OUTPUT_DIR = "frames"
METADATA_FILE = "video_metadata.json"

def extract_frames():
    os.makedirs(FRAME_OUTPUT_DIR, exist_ok=True)

    with open(METADATA_FILE, 'r', encoding='utf-8') as f:
        videos = json.load(f)

    pending_videos = [
        v for v in videos
        if v['status'].get('is_downloaded') and not v['status'].get('is_analyzed')
    ]

    if not pending_videos:
        print("✨ 沒有需要處理的影片。")
        return

    main_bar = tqdm(
        total=len(pending_videos),
        desc="總進度",
        position=0,
        leave=True,
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt}"
    )

    for v in pending_videos:
        v_id = v['video_id']
        video_path = v['status'].get('local_path')

        tqdm.write(f"\n▶ 處理中: {v_id}")

        if not video_path or not os.path.exists(video_path):
            tqdm.write(f"✖ 找不到檔案: {v_id}")
            main_bar.update(1)
            continue

        video_frame_dir = os.path.join(FRAME_OUTPUT_DIR, v_id)
        os.makedirs(video_frame_dir, exist_ok=True)

        ext = os.path.splitext(video_path)[1]
        temp_video_name = os.path.join(RAW_VIDEO_DIR, f"temp_{v_id}{ext}")

        try:
            os.rename(video_path, temp_video_name)

            abs_temp_path = os.path.abspath(temp_video_name)
            abs_output_path = os.path.abspath(
                os.path.join(video_frame_dir, "scene_%03d.jpg")
            )

            ffmpeg_cmd = [
                'ffmpeg', '-y', '-i', abs_temp_path,
                '-vf', "select='gt(scene,0.3)',scale=512:-1",
                '-vsync', 'vfr',
                '-q:v', '2',
                abs_output_path
            ]

            sub_bar = tqdm(
                total=100,
                desc="幀抽取",
                position=1,
                leave=False,
                bar_format="{l_bar}{bar}| {n_fmt}%"
            )

            process = subprocess.Popen(
                ffmpeg_cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                errors='ignore'
            )

            start_time = time.time()

            while True:
                line = process.stderr.readline()
                if not line:
                    break

                if "time=" in line:
                    elapsed = time.time() - start_time
                    progress = min(int(elapsed * 10), 100)
                    sub_bar.n = progress
                    sub_bar.refresh()

            process.wait()
            sub_bar.n = 100
            sub_bar.refresh()
            sub_bar.close()

            os.rename(temp_video_name, video_path)

            if process.returncode == 0:
                v['status']['is_analyzed'] = True
                v['status']['frames_path'] = video_frame_dir
                tqdm.write(f"✔ 完成: {v_id}")
            else:
                tqdm.write(f"✖ FFmpeg 失敗: {v_id}")

        except Exception as e:
            if os.path.exists(temp_video_name):
                os.rename(temp_video_name, video_path)
            tqdm.write(f"✖ 錯誤: {v_id} | {e}")

        main_bar.update(1)

        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(videos, f, indent=4, ensure_ascii=False)

    main_bar.close()
    print("\n✅ 抽幀任務結束！")

if __name__ == "__main__":
    extract_frames()