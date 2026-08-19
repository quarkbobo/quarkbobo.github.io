"""Tarot Reigns 卡牌编辑器 — 可视化管理卡牌数据"""

import sys
import os
import json
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
from pathlib import Path
import shutil


class CardEditor:
    """卡牌编辑器 — Tkinter GUI"""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Tarot Reigns · 卡牌编辑器")
        self.root.geometry("1200x750")
        self.root.configure(bg="#1a1a2e")

        # 数据
        self.data_path = None
        self.cards_data = {"intro_sequence": [], "cards": []}
        self.current_card_idx = -1
        self.asset_base = None

        # 自动查找 cards.json
        possible_paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "cards.json"),
            "data/cards.json",
        ]
        for p in possible_paths:
            if os.path.exists(os.path.abspath(p)):
                self.data_path = os.path.abspath(p)
                self.asset_base = os.path.dirname(self.data_path).replace("data", "assets/images/cards")
                break

        self._setup_style()
        self._build_ui()
        self._load_data()

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _setup_style(self):
        """暗色主题"""
        style = ttk.Style()
        style.theme_use("clam")

        bg = "#1a1a2e"
        fg = "#e0e0e0"
        accent = "#d4a574"
        dark_bg = "#252540"
        input_bg = "#2a2a40"

        style.configure(".", background=bg, foreground=fg)
        style.configure("TFrame", background=bg)
        style.configure("TLabelframe", background=bg, foreground=accent)
        style.configure("TLabelframe.Label", background=bg, foreground=accent, font=("Microsoft YaHei", 10, "bold"))
        style.configure("TLabel", background=bg, foreground=fg, font=("Microsoft YaHei", 9))
        style.configure("TButton", background="#3d3d5c", foreground=fg, font=("Microsoft YaHei", 9))
        style.map("TButton", background=[("active", "#d4a574")])
        style.configure("TEntry", fieldbackground=input_bg, foreground=fg, insertcolor=fg)
        style.configure("TCombobox", fieldbackground=input_bg, foreground=fg)
        style.configure("TSpinbox", fieldbackground=input_bg, foreground=fg)
        style.configure("Treeview",
                        background=dark_bg, foreground=fg,
                        fieldbackground=dark_bg, font=("Microsoft YaHei", 9))
        style.configure("Treeview.Heading", background="#3d3d5c", foreground=fg,
                        font=("Microsoft YaHei", 9, "bold"))
        style.map("Treeview", background=[("selected", "#d4a574")])

    def _build_ui(self):
        """构建界面"""
        # === 工具栏（Word风格 Ribbon）===
        toolbar = ttk.Frame(self.root, height=50)
        toolbar.pack(fill=tk.X, padx=2, pady=2)

        btn_style = {"padding": (12, 5)}

        ttk.Button(toolbar, text="📂 打开", command=self._open_file, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="💾 保存", command=self._save_data, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="📋 另存为", command=self._save_as, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8, pady=5)

        ttk.Button(toolbar, text="➕ 新建卡牌", command=self._new_card, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="🗑️ 删除卡牌", command=self._delete_card, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="📋 复制卡牌", command=self._duplicate_card, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8, pady=5)

        ttk.Button(toolbar, text="🖼️ 导入图片/GIF", command=self._import_image, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="🔊 导入语音", command=self._import_audio, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8, pady=5)

        ttk.Button(toolbar, text="🌳 剧情树", command=self._show_tree, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="▶️ 预览", command=self._preview_card, **btn_style).pack(side=tk.LEFT, padx=2)
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8, pady=5)

        ttk.Button(toolbar, text="🔄 刷新", command=self._refresh_list, **btn_style).pack(side=tk.LEFT, padx=2)

        # === 主面板 ===
        main_panel = ttk.Frame(self.root)
        main_panel.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        # 左侧：卡牌列表
        left_frame = ttk.LabelFrame(main_panel, text="卡牌列表", width=280)
        left_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 4))
        left_frame.pack_propagate(False)

        # 搜索框
        self.search_var = tk.StringVar()
        self.search_var.trace("w", lambda *a: self._refresh_list())
        search_entry = ttk.Entry(left_frame, textvariable=self.search_var)
        search_entry.pack(fill=tk.X, padx=5, pady=5)

        # 分类筛选
        filter_frame = ttk.Frame(left_frame)
        filter_frame.pack(fill=tk.X, padx=5, pady=2)
        self.filter_var = tk.StringVar(value="全部")
        for cat in ["全部", "intro", "daily", "special", "demon"]:
            ttk.Radiobutton(filter_frame, text=cat, value=cat,
                            variable=self.filter_var, command=self._refresh_list).pack(side=tk.LEFT)

        # 卡牌列表树
        tree_frame = ttk.Frame(left_frame)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)

        self.card_tree = ttk.Treeview(tree_frame, columns=("id", "category"),
                                       show="headings", height=25)
        self.card_tree.heading("id", text="ID")
        self.card_tree.heading("category", text="分类")
        self.card_tree.column("id", width=150)
        self.card_tree.column("category", width=80)
        self.card_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        tree_scroll = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL,
                                    command=self.card_tree.yview)
        tree_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.card_tree.configure(yscrollcommand=tree_scroll.set)
        self.card_tree.bind("<<TreeviewSelect>>", self._on_card_select)

        # 右侧：编辑区
        right_frame = ttk.Frame(main_panel)
        right_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # === 卡牌编辑表单 ===
        edit_frame = ttk.LabelFrame(right_frame, text="卡牌编辑")
        edit_frame.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)

        # 使用 Canvas + Scrollbar 实现可滚动编辑区
        edit_canvas = tk.Canvas(edit_frame, bg="#1a1a2e", highlightthickness=0)
        edit_scroll = ttk.Scrollbar(edit_frame, orient=tk.VERTICAL, command=edit_canvas.yview)
        self.edit_inner = ttk.Frame(edit_canvas)

        self.edit_inner.bind("<Configure>",
                             lambda e: edit_canvas.configure(scrollregion=edit_canvas.bbox("all")))
        edit_canvas.create_window((0, 0), window=self.edit_inner, anchor="nw")
        edit_canvas.configure(yscrollcommand=edit_scroll.set)

        edit_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        edit_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        # 表单字段
        row = 0
        pad = {"padx": 5, "pady": 3, "sticky": "w"}

        # ID
        ttk.Label(self.edit_inner, text="卡牌 ID *").grid(row=row, column=0, **pad)
        self.var_id = tk.StringVar()
        ttk.Entry(self.edit_inner, textvariable=self.var_id, width=30).grid(row=row, column=1, **pad)
        row += 1

        # 分类
        ttk.Label(self.edit_inner, text="分类").grid(row=row, column=0, **pad)
        self.var_category = tk.StringVar(value="daily")
        ttk.Combobox(self.edit_inner, textvariable=self.var_category,
                     values=["intro", "daily", "special", "demon"],
                     state="readonly", width=15).grid(row=row, column=1, **pad)
        row += 1

        # 角色
        ttk.Label(self.edit_inner, text="角色名").grid(row=row, column=0, **pad)
        self.var_character = tk.StringVar()
        ttk.Entry(self.edit_inner, textvariable=self.var_character, width=30).grid(row=row, column=1, **pad)
        row += 1

        # 卡面文字
        ttk.Label(self.edit_inner, text="卡面文字 *").grid(row=row, column=0, **pad)
        self.var_text = tk.StringVar()
        text_frame = ttk.Frame(self.edit_inner)
        text_frame.grid(row=row, column=1, **pad)
        self.text_widget = tk.Text(text_frame, width=45, height=6, bg="#2a2a40",
                                    fg="#e0e0e0", insertbackground="#e0e0e0",
                                    font=("Microsoft YaHei", 9), wrap=tk.WORD)
        self.text_widget.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        row += 1

        # 左滑文字
        ttk.Label(self.edit_inner, text="左滑选项 *").grid(row=row, column=0, **pad)
        self.var_left_text = tk.StringVar(value="拒绝")
        ttk.Entry(self.edit_inner, textvariable=self.var_left_text, width=35).grid(row=row, column=1, **pad)
        row += 1

        # 左滑效果 [火,水,风,土]
        ttk.Label(self.edit_inner, text="左滑效果").grid(row=row, column=0, **pad)
        effects_frame_l = ttk.Frame(self.edit_inner)
        effects_frame_l.grid(row=row, column=1, **pad)
        self.var_left_fire = tk.IntVar(value=0)
        self.var_left_water = tk.IntVar(value=0)
        self.var_left_wind = tk.IntVar(value=0)
        self.var_left_earth = tk.IntVar(value=0)
        ttk.Label(effects_frame_l, text="火").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_l, from_=-50, to=50, textvariable=self.var_left_fire, width=5).pack(side=tk.LEFT, padx=2)
        ttk.Label(effects_frame_l, text="水").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_l, from_=-50, to=50, textvariable=self.var_left_water, width=5).pack(side=tk.LEFT, padx=2)
        ttk.Label(effects_frame_l, text="风").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_l, from_=-50, to=50, textvariable=self.var_left_wind, width=5).pack(side=tk.LEFT, padx=2)
        ttk.Label(effects_frame_l, text="土").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_l, from_=-50, to=50, textvariable=self.var_left_earth, width=5).pack(side=tk.LEFT, padx=2)
        row += 1

        # 左滑跳转
        ttk.Label(self.edit_inner, text="左滑跳转 ID").grid(row=row, column=0, **pad)
        self.var_left_jump = tk.StringVar()
        ttk.Entry(self.edit_inner, textvariable=self.var_left_jump, width=30).grid(row=row, column=1, **pad)
        row += 1

        # 右滑文字
        ttk.Label(self.edit_inner, text="右滑选项 *").grid(row=row, column=0, **pad)
        self.var_right_text = tk.StringVar(value="同意")
        ttk.Entry(self.edit_inner, textvariable=self.var_right_text, width=35).grid(row=row, column=1, **pad)
        row += 1

        # 右滑效果
        ttk.Label(self.edit_inner, text="右滑效果").grid(row=row, column=0, **pad)
        effects_frame_r = ttk.Frame(self.edit_inner)
        effects_frame_r.grid(row=row, column=1, **pad)
        self.var_right_fire = tk.IntVar(value=0)
        self.var_right_water = tk.IntVar(value=0)
        self.var_right_wind = tk.IntVar(value=0)
        self.var_right_earth = tk.IntVar(value=0)
        ttk.Label(effects_frame_r, text="火").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_r, from_=-50, to=50, textvariable=self.var_right_fire, width=5).pack(side=tk.LEFT, padx=2)
        ttk.Label(effects_frame_r, text="水").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_r, from_=-50, to=50, textvariable=self.var_right_water, width=5).pack(side=tk.LEFT, padx=2)
        ttk.Label(effects_frame_r, text="风").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_r, from_=-50, to=50, textvariable=self.var_right_wind, width=5).pack(side=tk.LEFT, padx=2)
        ttk.Label(effects_frame_r, text="土").pack(side=tk.LEFT)
        ttk.Spinbox(effects_frame_r, from_=-50, to=50, textvariable=self.var_right_earth, width=5).pack(side=tk.LEFT, padx=2)
        row += 1

        # 右滑跳转
        ttk.Label(self.edit_inner, text="右滑跳转 ID").grid(row=row, column=0, **pad)
        self.var_right_jump = tk.StringVar()
        ttk.Entry(self.edit_inner, textvariable=self.var_right_jump, width=30).grid(row=row, column=1, **pad)
        row += 1

        # 图片路径
        ttk.Label(self.edit_inner, text="卡面图片").grid(row=row, column=0, **pad)
        img_frame = ttk.Frame(self.edit_inner)
        img_frame.grid(row=row, column=1, **pad)
        self.var_image = tk.StringVar()
        ttk.Entry(img_frame, textvariable=self.var_image, width=25).pack(side=tk.LEFT)
        ttk.Button(img_frame, text="浏览", command=self._browse_image).pack(side=tk.LEFT, padx=5)
        row += 1

        # 优先级
        ttk.Label(self.edit_inner, text="优先级").grid(row=row, column=0, **pad)
        self.var_priority = tk.IntVar(value=0)
        ttk.Spinbox(self.edit_inner, from_=0, to=100, textvariable=self.var_priority, width=8).grid(row=row, column=1, **pad)
        row += 1

        # 仅一次
        self.var_once = tk.BooleanVar(value=False)
        ttk.Checkbutton(self.edit_inner, text="仅出现一次", variable=self.var_once).grid(row=row, column=1, **pad)
        row += 1

        # 授予塔罗牌
        ttk.Label(self.edit_inner, text="授予塔罗牌").grid(row=row, column=0, **pad)
        self.var_grant_tarot = tk.StringVar()
        tarot_values = ["(无)"] + [
            "fool", "magician", "high_priestess", "emperor", "lovers", "chariot",
            "strength", "hermit", "wheel", "justice", "hanged_man", "death",
            "temperance", "devil", "tower", "star", "moon", "sun", "judgement", "world"
        ]
        ttk.Combobox(self.edit_inner, textvariable=self.var_grant_tarot,
                     values=tarot_values, width=18).grid(row=row, column=1, **pad)
        row += 1

        # 标签
        ttk.Label(self.edit_inner, text="标签（逗号分隔）").grid(row=row, column=0, **pad)
        self.var_tags = tk.StringVar()
        ttk.Entry(self.edit_inner, textvariable=self.var_tags, width=35).grid(row=row, column=1, **pad)
        row += 1

        # === 出现条件 ===
        cond_frame = ttk.LabelFrame(self.edit_inner, text="出现条件")
        cond_frame.grid(row=row, column=0, columnspan=2, sticky="ew", padx=5, pady=10)
        row += 1

        cond_row = 0
        ttk.Label(cond_frame, text="火 min").grid(row=cond_row, column=0, padx=3, pady=2)
        self.var_cond_fire_min = tk.IntVar(value=0)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_fire_min, width=5).grid(row=cond_row, column=1, padx=3)

        ttk.Label(cond_frame, text="火 max").grid(row=cond_row, column=2, padx=3)
        self.var_cond_fire_max = tk.IntVar(value=100)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_fire_max, width=5).grid(row=cond_row, column=3, padx=3)

        ttk.Label(cond_frame, text="水 min").grid(row=cond_row, column=4, padx=3)
        self.var_cond_water_min = tk.IntVar(value=0)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_water_min, width=5).grid(row=cond_row, column=5, padx=3)

        ttk.Label(cond_frame, text="水 max").grid(row=cond_row, column=6, padx=3)
        self.var_cond_water_max = tk.IntVar(value=100)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_water_max, width=5).grid(row=cond_row, column=7, padx=3)

        cond_row += 1
        ttk.Label(cond_frame, text="风 min").grid(row=cond_row, column=0, padx=3, pady=2)
        self.var_cond_wind_min = tk.IntVar(value=0)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_wind_min, width=5).grid(row=cond_row, column=1, padx=3)

        ttk.Label(cond_frame, text="风 max").grid(row=cond_row, column=2, padx=3)
        self.var_cond_wind_max = tk.IntVar(value=100)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_wind_max, width=5).grid(row=cond_row, column=3, padx=3)

        ttk.Label(cond_frame, text="土 min").grid(row=cond_row, column=4, padx=3)
        self.var_cond_earth_min = tk.IntVar(value=0)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_earth_min, width=5).grid(row=cond_row, column=5, padx=3)

        ttk.Label(cond_frame, text="土 max").grid(row=cond_row, column=6, padx=3)
        self.var_cond_earth_max = tk.IntVar(value=100)
        ttk.Spinbox(cond_frame, from_=0, to=100, textvariable=self.var_cond_earth_max, width=5).grid(row=cond_row, column=7, padx=3)

        cond_row += 1
        ttk.Label(cond_frame, text="周 min").grid(row=cond_row, column=0, padx=3, pady=2)
        self.var_cond_week_min = tk.IntVar(value=0)
        ttk.Spinbox(cond_frame, from_=0, to=200, textvariable=self.var_cond_week_min, width=5).grid(row=cond_row, column=1, padx=3)

        ttk.Label(cond_frame, text="周 max").grid(row=cond_row, column=2, padx=3)
        self.var_cond_week_max = tk.IntVar(value=200)
        ttk.Spinbox(cond_frame, from_=0, to=200, textvariable=self.var_cond_week_max, width=5).grid(row=cond_row, column=3, padx=3)

        ttk.Label(cond_frame, text="周 =").grid(row=cond_row, column=4, padx=3)
        self.var_cond_week = tk.IntVar(value=0)
        ttk.Spinbox(cond_frame, from_=0, to=200, textvariable=self.var_cond_week, width=5).grid(row=cond_row, column=5, padx=3)

        # 底部状态栏
        status_frame = ttk.Frame(self.root)
        status_frame.pack(fill=tk.X, padx=5, pady=2)
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(status_frame, textvariable=self.status_var, font=("Microsoft YaHei", 8)).pack(side=tk.LEFT)
        ttk.Label(status_frame, text="Tarot Reigns · Card Editor v1.0",
                  font=("Microsoft YaHei", 8)).pack(side=tk.RIGHT)

    # ========== 事件处理 ==========

    def _load_data(self):
        """加载卡牌数据"""
        if not self.data_path or not os.path.exists(self.data_path):
            self.status_var.set("未找到 cards.json")
            return

        try:
            with open(self.data_path, "r", encoding="utf-8") as f:
                self.cards_data = json.load(f)
            self.status_var.set(f"已加载: {self.data_path} ({len(self.cards_data['cards'])} 张卡牌)")
            self._refresh_list()
        except Exception as e:
            self.status_var.set(f"加载失败: {e}")

    def _save_data(self):
        """保存数据"""
        # 先保存当前编辑的卡牌
        self._sync_current_card()

        if not self.data_path:
            self._save_as()
            return

        try:
            with open(self.data_path, "w", encoding="utf-8") as f:
                json.dump(self.cards_data, f, ensure_ascii=False, indent=2)
            self.status_var.set(f"已保存: {self.data_path}")
        except Exception as e:
            messagebox.showerror("保存失败", str(e))

    def _save_as(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON 文件", "*.json")],
            initialfile="cards.json"
        )
        if path:
            self.data_path = path
            self._save_data()

    def _open_file(self):
        path = filedialog.askopenfilename(filetypes=[("JSON 文件", "*.json")])
        if path:
            self._sync_current_card()
            self.data_path = path
            self._load_data()

    def _refresh_list(self):
        """刷新卡牌列表"""
        self.card_tree.delete(*self.card_tree.get_children())

        search = self.search_var.get().lower()
        category_filter = self.filter_var.get()

        for idx, card in enumerate(self.cards_data["cards"]):
            cid = card.get("id", "")
            cat = card.get("category", "")

            if category_filter != "全部" and cat != category_filter:
                continue
            if search and search not in cid.lower():
                # also search in text
                text = card.get("text", "").lower()
                if search not in text:
                    continue

            self.card_tree.insert("", "end", iid=str(idx), values=(cid, cat))

    def _on_card_select(self, event=None):
        """选中卡牌时加载到编辑区"""
        selection = self.card_tree.selection()
        if not selection:
            return
        idx = int(selection[0])
        self.current_card_idx = idx
        self._load_card_to_form(idx)

    def _load_card_to_form(self, idx):
        """加载卡牌到表单"""
        card = self.cards_data["cards"][idx]

        self.var_id.set(card.get("id", ""))
        self.var_category.set(card.get("category", "daily"))
        self.var_character.set(card.get("character", ""))

        self.text_widget.delete("1.0", tk.END)
        self.text_widget.insert("1.0", card.get("text", ""))

        self.var_left_text.set(card.get("left_text", "拒绝"))
        eff_l = card.get("left_effects", [0, 0, 0, 0])
        self.var_left_fire.set(eff_l[0] if len(eff_l) > 0 else 0)
        self.var_left_water.set(eff_l[1] if len(eff_l) > 1 else 0)
        self.var_left_wind.set(eff_l[2] if len(eff_l) > 2 else 0)
        self.var_left_earth.set(eff_l[3] if len(eff_l) > 3 else 0)
        self.var_left_jump.set(card.get("left_jump") or "")

        self.var_right_text.set(card.get("right_text", "同意"))
        eff_r = card.get("right_effects", [0, 0, 0, 0])
        self.var_right_fire.set(eff_r[0] if len(eff_r) > 0 else 0)
        self.var_right_water.set(eff_r[1] if len(eff_r) > 1 else 0)
        self.var_right_wind.set(eff_r[2] if len(eff_r) > 2 else 0)
        self.var_right_earth.set(eff_r[3] if len(eff_r) > 3 else 0)
        self.var_right_jump.set(card.get("right_jump") or "")

        self.var_image.set(card.get("image") or "")
        self.var_priority.set(card.get("priority", 0))
        self.var_once.set(card.get("once", False))
        self.var_grant_tarot.set(card.get("grant_tarot") or "(无)")
        self.var_tags.set(", ".join(card.get("tags", [])))

        # 条件
        cond = card.get("condition") or {}
        self.var_cond_fire_min.set(cond.get("fire_min", 0))
        self.var_cond_fire_max.set(cond.get("fire_max", 100))
        self.var_cond_water_min.set(cond.get("water_min", 0))
        self.var_cond_water_max.set(cond.get("water_max", 100))
        self.var_cond_wind_min.set(cond.get("wind_min", 0))
        self.var_cond_wind_max.set(cond.get("wind_max", 100))
        self.var_cond_earth_min.set(cond.get("earth_min", 0))
        self.var_cond_earth_max.set(cond.get("earth_max", 100))
        self.var_cond_week_min.set(cond.get("week_min", 0))
        self.var_cond_week_max.set(cond.get("week_max", 200))
        self.var_cond_week.set(cond.get("week", 0))

        self.status_var.set(f"正在编辑: {card.get('id', '')}")

    def _sync_current_card(self):
        """将表单数据同步回当前卡牌"""
        if self.current_card_idx < 0:
            return
        if self.current_card_idx >= len(self.cards_data["cards"]):
            return

        card = self.cards_data["cards"][self.current_card_idx]
        card["id"] = self.var_id.get().strip()
        card["category"] = self.var_category.get()
        card["character"] = self.var_character.get().strip() or None
        card["text"] = self.text_widget.get("1.0", "end-1c").strip()
        card["left_text"] = self.var_left_text.get()
        card["left_effects"] = [
            self.var_left_fire.get(), self.var_left_water.get(),
            self.var_left_wind.get(), self.var_left_earth.get()
        ]
        card["left_jump"] = self.var_left_jump.get().strip() or None
        card["right_text"] = self.var_right_text.get()
        card["right_effects"] = [
            self.var_right_fire.get(), self.var_right_water.get(),
            self.var_right_wind.get(), self.var_right_earth.get()
        ]
        card["right_jump"] = self.var_right_jump.get().strip() or None
        card["image"] = self.var_image.get().strip() or None
        card["priority"] = self.var_priority.get()
        card["once"] = self.var_once.get()

        grant = self.var_grant_tarot.get()
        card["grant_tarot"] = grant if grant != "(无)" else None

        tags_str = self.var_tags.get().strip()
        card["tags"] = [t.strip() for t in tags_str.split(",")] if tags_str else []

        # 条件
        condition = {}
        if self.var_cond_fire_min.get() > 0:
            condition["fire_min"] = self.var_cond_fire_min.get()
        if self.var_cond_fire_max.get() < 100:
            condition["fire_max"] = self.var_cond_fire_max.get()
        if self.var_cond_water_min.get() > 0:
            condition["water_min"] = self.var_cond_water_min.get()
        if self.var_cond_water_max.get() < 100:
            condition["water_max"] = self.var_cond_water_max.get()
        if self.var_cond_wind_min.get() > 0:
            condition["wind_min"] = self.var_cond_wind_min.get()
        if self.var_cond_wind_max.get() < 100:
            condition["wind_max"] = self.var_cond_wind_max.get()
        if self.var_cond_earth_min.get() > 0:
            condition["earth_min"] = self.var_cond_earth_min.get()
        if self.var_cond_earth_max.get() < 100:
            condition["earth_max"] = self.var_cond_earth_max.get()
        if self.var_cond_week_min.get() > 0:
            condition["week_min"] = self.var_cond_week_min.get()
        if self.var_cond_week_max.get() < 200:
            condition["week_max"] = self.var_cond_week_max.get()
        if self.var_cond_week.get() > 0:
            condition["week"] = self.var_cond_week.get()

        card["condition"] = condition if condition else None

    def _new_card(self):
        """创建新卡牌"""
        self._sync_current_card()
        new_id = simpledialog.askstring("新建卡牌", "请输入卡牌 ID:")
        if not new_id:
            return

        new_card = {
            "id": new_id,
            "text": "新卡牌内容",
            "left_text": "拒绝",
            "right_text": "同意",
            "left_effects": [0, 0, 0, 0],
            "right_effects": [0, 0, 0, 0],
            "category": "daily",
            "priority": 0,
            "tags": []
        }
        self.cards_data["cards"].append(new_card)
        self._refresh_list()
        self.current_card_idx = len(self.cards_data["cards"]) - 1
        self._load_card_to_form(self.current_card_idx)
        self.card_tree.selection_set(str(self.current_card_idx))
        self.status_var.set(f"已创建: {new_id}")

    def _delete_card(self):
        if self.current_card_idx < 0:
            return
        card_id = self.cards_data["cards"][self.current_card_idx]["id"]
        if not messagebox.askyesno("确认删除", f"确定删除卡牌「{card_id}」吗？"):
            return

        del self.cards_data["cards"][self.current_card_idx]
        self.current_card_idx = -1
        self._refresh_list()
        self.status_var.set(f"已删除: {card_id}")

    def _duplicate_card(self):
        if self.current_card_idx < 0:
            return
        self._sync_current_card()
        import copy
        original = self.cards_data["cards"][self.current_card_idx]
        new_card = copy.deepcopy(original)
        new_card["id"] = original["id"] + "_copy"
        self.cards_data["cards"].append(new_card)
        self._refresh_list()
        self.status_var.set(f"已复制: {new_card['id']}")

    def _import_image(self):
        """导入卡面图片/GIF"""
        path = filedialog.askopenfilename(
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.gif")]
        )
        if path:
            # 复制到 assets/images/cards/
            if self.asset_base:
                os.makedirs(self.asset_base, exist_ok=True)
                dest = os.path.join(self.asset_base, os.path.basename(path))
                shutil.copy2(path, dest)
                self.var_image.set(dest)
            else:
                self.var_image.set(path)
            self.status_var.set(f"已导入图片: {os.path.basename(path)}")

    def _import_audio(self):
        """导入语音"""
        path = filedialog.askopenfilename(
            filetypes=[("音频文件", "*.mp3 *.wav *.ogg")]
        )
        if path:
            # 复制
            audio_dir = os.path.join(os.path.dirname(self.asset_base or ""), "..", "sounds", "sfx")
            audio_dir = os.path.abspath(audio_dir)
            os.makedirs(audio_dir, exist_ok=True)
            dest = os.path.join(audio_dir, os.path.basename(path))
            shutil.copy2(path, dest)
            self.status_var.set(f"已导入音频: {os.path.basename(path)}")

    def _browse_image(self):
        path = filedialog.askopenfilename(
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.gif")]
        )
        if path:
            self.var_image.set(path)

    def _show_tree(self):
        """显示剧情树"""
        self._sync_current_card()

        tree_win = tk.Toplevel(self.root)
        tree_win.title("剧情树视图")
        tree_win.geometry("600x450")
        tree_win.configure(bg="#1a1a2e")

        # Canvas 绘制树
        canvas = tk.Canvas(tree_win, bg="#1a1a2e", highlightthickness=0)
        canvas.pack(fill=tk.BOTH, expand=True)

        # 构建节点图
        nodes = {}
        for card in self.cards_data["cards"]:
            cid = card["id"]
            if cid not in nodes:
                nodes[cid] = {"x": 0, "y": 0, "left": card.get("left_jump"), "right": card.get("right_jump"),
                              "category": card.get("category", "daily")}

        # 简单布局：intro 在最左边，然后随机布局
        x, y = 100, 50
        colors = {"intro": "#d4a574", "daily": "#3498db", "special": "#9b59b6", "demon": "#e74c3c"}
        positions = {}

        # 先布局intro序列
        intro_ids = self.cards_data.get("intro_sequence", [])
        for cid in intro_ids:
            positions[cid] = (x, y)
            x += 150
            if x > 500:
                x = 100
                y += 100

        # 布局其他
        for cid in nodes:
            if cid not in positions:
                positions[cid] = (x, y)
                x += 150
                if x > 500:
                    x = 100
                    y += 100

        # 绘制
        # 先画连线
        for cid, node in nodes.items():
            if cid not in positions:
                continue
            px, py = positions[cid]
            for direction, target in [("left", node["left"]), ("right", node["right"])]:
                if target and target in positions:
                    tx, ty = positions[target]
                    line_color = "#e74c3c" if direction == "left" else "#2ecc71"
                    canvas.create_line(px + 40, py + 30, tx + 40, ty + 10,
                                       fill=line_color, width=1, arrow=tk.LAST)

        # 再画节点
        for cid in nodes:
            if cid not in positions:
                continue
            px, py = positions[cid]
            color = colors.get(nodes[cid]["category"], "#3498db")

            canvas.create_rectangle(px, py, px + 80, py + 30,
                                    fill=color, outline="#1a1a2e", width=2)
            canvas.create_text(px + 40, py + 15, text=cid,
                               fill="white", font=("Microsoft YaHei", 8))

        self.status_var.set("剧情树已生成")

    def _preview_card(self):
        """预览当前卡牌在游戏中的外观"""
        self._sync_current_card()
        if self.current_card_idx < 0:
            return

        card = self.cards_data["cards"][self.current_card_idx]

        preview_win = tk.Toplevel(self.root)
        preview_win.title(f"预览: {card['id']}")
        preview_win.geometry("400x560")
        preview_win.configure(bg="#1a1a2e")

        # 模拟卡牌
        card_bg = tk.Frame(preview_win, bg="#f4e4c1", width=340, height=480)
        card_bg.pack(expand=True)
        card_bg.pack_propagate(False)

        # 角色
        char = card.get("character", "")
        if char:
            tk.Label(card_bg, text=char, bg="#f4e4c1", fg="#d4a574",
                     font=("Microsoft YaHei", 11)).pack(pady=(15, 0))

        # 分隔线
        tk.Frame(card_bg, bg="#d4a574", height=1, width=280).pack(pady=10)

        # 正文
        tk.Label(card_bg, text=card["text"], bg="#f4e4c1", fg="#3d2b1f",
                 font=("Microsoft YaHei", 12), wraplength=300, justify=tk.LEFT).pack(pady=15, padx=20)

        # 底部选项
        opt_frame = tk.Frame(card_bg, bg="#f4e4c1")
        opt_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=20, padx=20)

        tk.Label(opt_frame, text=f"← {card['left_text']}", bg="#f4e4c1",
                 fg="#a05050", font=("Microsoft YaHei", 10)).pack(side=tk.LEFT)
        tk.Label(opt_frame, text=f"{card['right_text']} →", bg="#f4e4c1",
                 fg="#508050", font=("Microsoft YaHei", 10)).pack(side=tk.RIGHT)

        # 效果
        eff_frame = tk.Frame(card_bg, bg="#f4e4c1")
        eff_frame.pack(side=tk.BOTTOM, pady=5)
        left_eff_str = f"左: 火{card['left_effects'][0]} 水{card['left_effects'][1]} 风{card['left_effects'][2]} 土{card['left_effects'][3]}"
        right_eff_str = f"右: 火{card['right_effects'][0]} 水{card['right_effects'][1]} 风{card['right_effects'][2]} 土{card['right_effects'][3]}"
        tk.Label(eff_frame, text=f"{left_eff_str}  |  {right_eff_str}",
                 bg="#f4e4c1", fg="#888888", font=("Microsoft YaHei", 7)).pack()

    def _on_close(self):
        """关闭窗口"""
        self._sync_current_card()
        if messagebox.askyesno("退出", "是否保存修改？"):
            self._save_data()
        self.root.destroy()


def main():
    editor = CardEditor()
    editor.root.mainloop()


if __name__ == "__main__":
    main()
