import json
import os
from datetime import datetime

QUOTA_FILE = 'quota_manager.json'
DAILY_MAX_QUOTA = 10000

def check_and_consume_quota(cost):
    # 計算消耗的Quota
    # :param cost: 本次操作預計消耗的Quota
    # :return: (bool, int) - 是否成功消耗, 今日剩餘Quota
    today = datetime.now().strftime('%y-%m-%d')

    if os.path.exists(QUOTA_FILE):
        with open(QUOTA_FILE, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}
    else:
        data = {}
    
    if today not in data:
        data[today] = DAILY_MAX_QUOTA
        # 為了保持檔案整潔，可以考慮刪除過舊的日期紀錄 (選配)
        # if len(data) > 30: 
        #     oldest_date = sorted(data.keys())[0]
        #     del data[oldest_date]
    
    if data[today] >= cost:
        data[today] -= cost
        remaining = data[today]

        with open(QUOTA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)

        return True, remaining
    else:
        return False, data[today]

def get_current_remaining():
    # 單純查詢今日剩下Quota
    today = datetime.now().strftime('%y-%m-%d')
    if os.path.exists(QUOTA_FILE):
        with open(QUOTA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get(today, DAILY_MAX_QUOTA)
    return DAILY_MAX_QUOTA