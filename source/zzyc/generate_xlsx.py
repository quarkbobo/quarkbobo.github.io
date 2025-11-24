import os
from openpyxl import Workbook
from datetime import datetime

# 你的网站根目录路径（建议设成脚本所在目录）
WEB_ROOT = os.path.dirname(os.path.abspath(__file__))

def format_time(ts):
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")

def list_dir_to_excel(target_path, output_xlsx, recursive=False, base_label=""):
    wb = Workbook()
    ws = wb.active
    ws.title = "Files"

    # 表头
    ws.append(["相对路径", "类型", "大小（字节）", "最后修改时间"])

    if recursive:
        for root, dirs, files in os.walk(target_path):
            rel_root = os.path.relpath(root, WEB_ROOT)
            # 先把目录本身写进表（如果需要）
            ws.append([
                rel_root,
                "文件夹",
                "",
                format_time(os.path.getmtime(root))
            ])

            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, WEB_ROOT)
                size = os.path.getsize(full_path)
                mtime = format_time(os.path.getmtime(full_path))
                ws.append([rel_path, "文件", size, mtime])
    else:
        # 非递归，只列出当前目录层级
        for name in sorted(os.listdir(target_path)):
            full_path = os.path.join(target_path, name)
            rel_path = os.path.relpath(full_path, WEB_ROOT)
            mtime = format_time(os.path.getmtime(full_path))

            if os.path.isdir(full_path):
                ws.append([rel_path, "文件夹", "", mtime])
            else:
                size = os.path.getsize(full_path)
                ws.append([rel_path, "文件", size, mtime])

    print(f"[OK] 已生成：{output_xlsx}")
    wb.save(output_xlsx)


if __name__ == "__main__":
    # 1. 网站根目录列表（含 index.html 等）
    root_xlsx = os.path.join(WEB_ROOT, "downloads", "root_files.xlsx")
    list_dir_to_excel(
        target_path=WEB_ROOT,
        output_xlsx=root_xlsx,
        recursive=False,
        base_label="根目录"
    )

    # 2. downloads 目录非递归
    downloads_dir = os.path.join(WEB_ROOT, "downloads")
    if not os.path.exists(downloads_dir):
        os.makedirs(downloads_dir)

    downloads_xlsx = os.path.join(downloads_dir, "downloads_files.xlsx")
    list_dir_to_excel(
        target_path=downloads_dir,
        output_xlsx=downloads_xlsx,
        recursive=False,
        base_label="downloads"
    )

    # 3. downloads 目录递归
    downloads_recursive_xlsx = os.path.join(downloads_dir, "downloads_tree_recursive.xlsx")
    list_dir_to_excel(
        target_path=downloads_dir,
        output_xlsx=downloads_recursive_xlsx,
        recursive=True,
        base_label="downloads(递归)"
    )

    print("全部目录 Excel 已生成完成。")
