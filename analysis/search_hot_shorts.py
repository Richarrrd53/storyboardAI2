import os
import json
import time
import isodate
from datetime import datetime
from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError #API專用錯誤處理

from quota_utils import check_and_consume_quota

load_dotenv()

API_KEY = os.getenv("YOUTUBE_API_KEY")

MAX_STORED_VIDEOS = 500 # 設定本地資料庫最大儲存數量，防止檔案無限增長

def get_youtube_client():
    if not API_KEY:
        print("[!] 找不到API KEY！！")
        return None
    return build('youtube', 'v3', developerKey=API_KEY)

youtube = get_youtube_client()

def get_trending_shorts():
    # 注意！每天免費10,000點Quota，search 1 次100點，videos.list 扣 1 點
    # 執行方法 A：取得發燒影片 (mostPopular)
    # chart="mostPopular" 是獲取熱門影片最節省配額的方式
    # videos().list(): 每呼叫一次（不論 maxResults 是 1 還是 50），基本的消耗就是 1 點。
    # search().list(): 每呼叫一次，基本的消耗就是 100 點。


    # 檢查目前資料數量，若達標則跳過
    if os.path.exists('video_metadata.json'):
        with open('video_metadata.json', 'r', encoding='utf-8') as f:
            try:
                current_data = json.load(f)
                if len(current_data) >= MAX_STORED_VIDEOS:
                    print(f"[!] 資料庫已達上限 ({MAX_STORED_VIDEOS})，暫停抓取影片。")
                    return []
            except json.JSONDecodeError:
                pass

    # 檢查Quota (videos.list 消耗 1 點)
    success_s, rem_s = check_and_consume_quota(100)
    current_rem = rem_s
    if not success_s:
        print(f"[!] Search 配額不足，剩餘：{rem_s}")
        return [], rem_s
    
    # 呼叫 API
    # 新增錯誤處理
    try:
        request = youtube.search().list(
            part="snippet",
            q="搞笑|推薦|短影音|開箱|團購|廣告|省錢|搞笑|美食|旅遊|生活",
            type="video",
            videoDuration="short", # 4分鐘以下
            maxResults=50,
            regionCode="TW",
            order="relevance"
        )
        search_response = request.execute()
        items = search_response.get('items', [])

        if not items:
            print("[!] 搜尋結果為空，本次任務結束。")
            return [], current_rem
    except Exception as e:
        print(f"[X] Search 呼叫失敗 => {e}")
        return [], current_rem
    
    success_v, rem_v = check_and_consume_quota(1)
    current_rem = rem_v
    if not success_v:
        print(f"[!] Videos 配額不足，剩餘：{rem_v}")
        return [], rem_s
    try:
        video_ids = [item['id']['videoId'] for item in search_response.get('items', [])]

        # 因為 search 回傳的資料不含觀看數與時長，必須再呼叫一次 videos().list (消耗 1 點)
        stats_request = youtube.videos().list(
            part="statistics,contentDetails,snippet",
            id=",".join(video_ids)
        )
        response = stats_request.execute()
    except HttpError as e:
        print(f"[X] Videos 詳細數據抓取失敗: {e}")
        return [], current_rem
    except Exception as e:
        print(f"[X] 發生未知錯誤！ => {e}")
        return [], current_rem

    filtered_list = []

    for item in response.get('items', []):
        try:
            stats = item['statistics']
            content_details = item['contentDetails']
            snippet = item['snippet']
            
            # 取得數據並轉換為int
            view_count = int(stats.get('viewCount', 0))
            like_count = int(stats.get('likeCount', 0))

            # 篩選條件：點擊率
            # 避免除以零，並計算案讚與觀看比例
            like_ratio = like_count / view_count if view_count > 0 else 0

            # 解析影片時常( youtube 回傳格式為 ISO 8601，如 PT59S)
            duration_sec = isodate.parse_duration(content_details['duration']).total_seconds()

            # 條件：觀看數 > 10,000 且點讚率 > 0.09 且時長 < 120s
            if view_count > 10000 and like_ratio > 0.009 and duration_sec < 120 and duration_sec > 0:
                filtered_list.append({
                    'title': snippet['title'],
                    'video_id': item['id'],
                    'views': view_count,
                    'like_ratio': round(like_ratio * 100, 2),
                    'duration': duration_sec,
                    'channel_title': snippet['channelTitle']
                })
        except KeyError as e:
            print(f"[!] 影片數據格式異常，已跳過該筆。 {e}")
            continue
    return filtered_list, current_rem

def save_raw_data(new_videos):
    file_path = 'video_metadata.json'

    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
    else:
        existing_data = []
    
    # 排除重複並合併(以video_id為基準)
    existing_ids = {v['video_id']for v in existing_data}
    added_count = 0
    
    for v in new_videos:
        if v['video_id'] not in existing_ids:
            # 加入狀態追蹤
            v['status'] = {"is_downloaded": False, "is_analyzed": False}
            existing_data.append(v)
            added_count += 1

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(existing_data, f, indent=4, ensure_ascii=False)
    
    print(f"成功保存 {added_count} 筆資料至 metadata！")

def job():
    print("------------------------")
    print(f"[O] 開始執行任務: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    shorts, remaining = get_trending_shorts()
    print(f"[O] 抓取完成，符合條件數量: {len(shorts)} 。剩餘配額： {remaining}")
    save_raw_data(shorts)

# 每 30 分鐘執行一次 (1800 秒)
while True:
    job()
    print("[O] 進入休眠，30分鐘後再次執行...")
    time.sleep(1800)