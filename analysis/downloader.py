import json
import os
import re
import subprocess
import yt_dlp
from tqdm import tqdm

RAW_VIDEO_DIR = 'raw_videos'
METADATA_FILE = 'video_metadata.json'

def ytdlp_progress_hook(d):
    if d['status'] == 'downloading':
        pbar.update(d.get('downloaded_bytes', 0) - pbar.n)
    elif d['status'] == 'finished':
        pbar.update(pbar.total - pbar.n)
        pbar.close()

def sanitize_filename(filename):
    # 只保留中文、英文、數字，將其他符號替換成底線
    return re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9]', '_', filename)

def download_pending_videos():
    if not os.path.exists(RAW_VIDEO_DIR):
        os.makedirs(RAW_VIDEO_DIR)
    
    if not os.path.exists(METADATA_FILE):
        print(f"[!] 找不到 {METADATA_FILE} ！")
        return
    
    with open(METADATA_FILE, 'r', encoding='utf-8') as f:
        videos = json.load(f)
    
    pending_videos = [v for v in videos if not v['status'].get('is_downloaded', False)]

    if not pending_videos:
        print("✨ 所有影片皆已下載完成！")
        return
    print(f"📦 準備開始下載 {len(pending_videos)} 部影片...")

    for v in pending_videos:
        v_id = v['video_id']
        video_url = f"https://www.youtube.com/watch?v={v_id}"
        
        safe_title = sanitize_filename(v['title'][:20]) # 取前 20 個字即可
        filename = f"{v_id}_{safe_title}.mp4"
        output_path = os.path.join(RAW_VIDEO_DIR, filename)

        # 限制畫質為 720p 以節省空間與後續處理速度
        # 使用 yt-dlp 執行下載
        # -f 'bestvideo[height<=720]+bestaudio/best[height<=720]' 確保相容性與畫質平衡
        ydl_opts = {
            'format': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]',
            'outtmpl': output_path,
            'quiet': True, #關閉預設輸出
            'no_warnings': True,
            'progress_hooks': [ytdlp_progress_hook],
        }

        global pbar
        print(f"🎬 正在下載: {v['title'][:30]}...")
        pbar = tqdm(unit='B', unit_scale=True, desc=f"ID: {v_id}", miniters=1)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # 取得影片資訊以設定進度條總長度
                info = ydl.extract_info(video_url, download=False)
                pbar.total = info.get('filesize') or info.get('filesize_approx') or 0
                # 開始下載
                ydl.download([video_url])
            
            # 更新 JSON 狀態
            v['status']['is_downloaded'] = True
            v['status']['local_path'] = output_path # 額外紀錄存檔路徑
            with open(METADATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(videos, f, indent=4, ensure_ascii=False)
        except subprocess.CalledProcessError as e:
            print(f"[X] 下載失敗 {v_id} => {e}")
        except Exception as e:
            print(f"[X] 發生未知錯誤 => {e}")
    print("\n✅ 下載任務全部完成！")


if __name__ == "__main__":
    download_pending_videos()