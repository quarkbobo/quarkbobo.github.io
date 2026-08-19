"""主渲染器 — 绘制游戏画面"""

import math
import pygame
from typing import Optional, Tuple

from core.player import Player
from core.card_system import Card

# 配色
BG_COLOR = (26, 26, 46)           # 深紫黑
CARD_COLOR = (244, 228, 193)       # 羊皮纸
TEXT_COLOR = (61, 43, 31)          # 深棕
FIRE_COLOR = (231, 76, 60)         # 橙红
WATER_COLOR = (52, 152, 219)       # 天蓝
WIND_COLOR = (155, 89, 182)        # 淡紫
EARTH_COLOR = (39, 174, 96)        # 草绿
GOLD_COLOR = (212, 165, 116)       # 烫金
YELLOW_COLOR = (241, 196, 15)      # 警示黄
WHITE = (255, 255, 255)
DARK = (20, 20, 30)

# 尺寸常量
WINDOW_W, WINDOW_H = 480, 720
CARD_W, CARD_H = 340, 480
ELEMENT_BAR_H = 8
HUD_TOP = 10


class Renderer:
    """游戏渲染器"""

    def __init__(self, screen: pygame.Surface):
        self.screen = screen
        self.w, self.h = screen.get_size()
        self.font_large = None
        self.font_medium = None
        self.font_small = None
        self.font_tiny = None
        self._init_fonts()

    def _init_fonts(self):
        """初始化字体"""
        try:
            # 尝试加载中文字体
            font_paths = [
                "C:/Windows/Fonts/simhei.ttf",
                "C:/Windows/Fonts/msyh.ttc",
                "C:/Windows/Fonts/simsun.ttc",
                "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
                "/System/Library/Fonts/PingFang.ttc",
            ]
            font_path = None
            for fp in font_paths:
                try:
                    with open(fp, "rb"):
                        font_path = fp
                        break
                except (FileNotFoundError, IOError):
                    continue

            if font_path:
                self.font_large = pygame.font.Font(font_path, 28)
                self.font_medium = pygame.font.Font(font_path, 22)
                self.font_small = pygame.font.Font(font_path, 16)
                self.font_tiny = pygame.font.Font(font_path, 12)
            else:
                self.font_large = pygame.font.Font(None, 32)
                self.font_medium = pygame.font.Font(None, 24)
                self.font_small = pygame.font.Font(None, 18)
                self.font_tiny = pygame.font.Font(None, 14)
        except Exception:
            self.font_large = pygame.font.Font(None, 32)
            self.font_medium = pygame.font.Font(None, 24)
            self.font_small = pygame.font.Font(None, 18)
            self.font_tiny = pygame.font.Font(None, 14)

    def draw_background(self):
        """绘制背景"""
        self.screen.fill(BG_COLOR)
        # 绘制微弱的纹理效果
        for i in range(0, self.w, 40):
            for j in range(0, self.h, 40):
                alpha = abs(math.sin(i * 0.02 + j * 0.02)) * 8
                pygame.draw.rect(self.screen, (30, 30, 50),
                                 (i + 2, j + 2, 36, 36), 0)
                s = pygame.Surface((36, 36), pygame.SRCALPHA)
                s.fill((0, 0, 0, int(alpha)))
                self.screen.blit(s, (i + 2, j + 2))

    def draw_hud(self, player: Player):
        """绘制顶部 HUD"""
        # 半透明背景条
        hud_rect = pygame.Rect(0, 0, self.w, 100)
        s = pygame.Surface((self.w, 100), pygame.SRCALPHA)
        s.fill((0, 0, 0, 180))
        self.screen.blit(s, (0, 0))

        # 时间信息
        time_text = f"第{player.week}周 · {player.year_name} · Day {player.day}"
        time_surf = self.font_small.render(time_text, True, GOLD_COLOR)
        self.screen.blit(time_surf, (10, HUD_TOP))

        # 四元素条
        elements = [
            ("火", player.fire, FIRE_COLOR, 10),
            ("水", player.water, WATER_COLOR, 110),
            ("风", player.wind, WIND_COLOR, 210),
            ("土", player.earth, EARTH_COLOR, 310),
        ]

        bar_w = 90
        bar_x_start = 20

        for idx, (name, value, color, y_offset) in enumerate(elements):
            x = bar_x_start + idx * 110
            y = HUD_TOP + 25

            # 标签
            label = self.font_tiny.render(name, True, color)
            self.screen.blit(label, (x, y - 2))

            # 数值
            val_text = self.font_tiny.render(str(value), True, GOLD_COLOR)
            self.screen.blit(val_text, (x + bar_w + 5, y - 2))

            # 背景条
            pygame.draw.rect(self.screen, (40, 40, 60), (x, y + 12, bar_w, ELEMENT_BAR_H), border_radius=4)

            # 填充条
            fill_w = int(bar_w * value / 100)
            pygame.draw.rect(self.screen, color, (x, y + 12, fill_w, ELEMENT_BAR_H), border_radius=4)

        # 塔罗牌槽
        tarot_y = HUD_TOP + 50
        tarot_label = self.font_tiny.render("塔罗牌:", True, GOLD_COLOR)
        self.screen.blit(tarot_label, (10, tarot_y))

        if player.tarot_card:
            from core.player import TAROT_DECK
            card_info = TAROT_DECK.get(player.tarot_card, {})
            tarot_name = card_info.get("name", "???")
            tarot_text = self.font_small.render(f"🃏 {tarot_name}", True, YELLOW_COLOR)
            self.screen.blit(tarot_text, (75, tarot_y))
            hint = self.font_tiny.render("(空格键使用)", True, (150, 150, 150))
            self.screen.blit(hint, (75, tarot_y + 20))
        else:
            no_tarot = self.font_tiny.render("无", True, (100, 100, 100))
            self.screen.blit(no_tarot, (75, tarot_y))

    def draw_card(self, card: Card, offset_x: float = 0, offset_y: float = 0,
                  rotation: float = 0, alpha: int = 255, show_effects: bool = False):
        """绘制卡牌（支持拖动状态）"""
        cx = self.w // 2
        cy = self.h // 2 + 20

        self._draw_card_inner(card, cx + offset_x, cy + offset_y, rotation, alpha)

        # 显示效果预览（拖动超过阈值时）
        if show_effects and abs(offset_x) > CARD_W * 0.25:
            self._draw_effect_preview(card, offset_x, cx, cy)

    def draw_card_peek(self, card: Card):
        """绘制下一张牌的预览（在当前卡牌下方露出一角）"""
        cx = self.w // 2
        cy = self.h // 2 + 20

        # 下一张牌往下偏移，只露出顶部一小条
        peek_offset_y = 320  # 牌面高度 480，露 480-320=160px 顶部

        # 半透明 + 暗暗的颜色
        self._draw_card_inner(card, cx, cy + peek_offset_y, rotation=0, alpha=100)

        # 下一张牌标签
        hint = self.font_tiny.render("下一张...", True, GOLD_COLOR)
        hint_rect = hint.get_rect(centerx=cx, top=cy + peek_offset_y - 240 + 10)
        self.screen.blit(hint, hint_rect)

    def _draw_card_inner(self, card: Card, cx: float, cy: float,
                         rotation: float = 0, alpha: int = 255):
        """核心卡牌绘制 — 在 (cx, cy) 中心绘制一张卡牌"""

        # 创建卡牌 surface
        card_surf = pygame.Surface((CARD_W, CARD_H), pygame.SRCALPHA)

        # 卡牌主体
        pygame.draw.rect(card_surf, CARD_COLOR,
                         (0, 0, CARD_W, CARD_H), border_radius=12)
        # 边框
        pygame.draw.rect(card_surf, GOLD_COLOR,
                         (0, 0, CARD_W, CARD_H), 2, border_radius=12)

        # 内边框装饰
        pygame.draw.rect(card_surf, GOLD_COLOR,
                         (10, 10, CARD_W - 20, CARD_H - 20), 1, border_radius=8)
        pygame.draw.rect(card_surf, GOLD_COLOR,
                         (14, 14, CARD_W - 28, CARD_H - 28), 1, border_radius=6)

        # 角色名
        if card.character:
            char_surf = self.font_small.render(card.character, True, GOLD_COLOR)
            char_rect = char_surf.get_rect(centerx=CARD_W // 2, top=20)
            card_surf.blit(char_surf, char_rect)

        # 分隔线
        line_y = 50 if card.character else 30
        pygame.draw.line(card_surf, GOLD_COLOR,
                         (40, line_y), (CARD_W - 40, line_y), 1)

        # 卡面文字（自动换行）
        text_lines = self._wrap_text(card.text, CARD_W - 60, self.font_medium)
        text_y = line_y + 20
        for line in text_lines:
            text_surf = self.font_medium.render(line, True, TEXT_COLOR)
            text_rect = text_surf.get_rect(centerx=CARD_W // 2, top=text_y)
            card_surf.blit(text_surf, text_rect)
            text_y += self.font_medium.get_height() + 6

        # 图片/GIF（如果有）
        if card.image:
            try:
                img = pygame.image.load(str(card.image))
                img = pygame.transform.scale(img, (CARD_W - 40, 180))
                img_rect = img.get_rect(centerx=CARD_W // 2, top=text_y + 10)
                card_surf.blit(img, img_rect)
            except Exception:
                pass

        # 底部选项
        option_y = CARD_H - 60
        left_surf = self.font_small.render(f"← {card.left_text}", True, (160, 80, 80))
        right_surf = self.font_small.render(f"{card.right_text} →", True, (80, 130, 80))
        card_surf.blit(left_surf, (30, option_y))
        right_rect = right_surf.get_rect(right=CARD_W - 30, top=option_y)
        card_surf.blit(right_surf, right_rect)

        # 旋转
        if rotation != 0:
            card_surf = pygame.transform.rotate(card_surf, rotation)

        # 透明度
        if alpha < 255:
            card_surf.set_alpha(alpha)

        # 阴影
        shadow_surf = pygame.Surface((CARD_W + 12, CARD_H + 12), pygame.SRCALPHA)
        shadow_alpha = min(60, alpha // 4) if alpha < 255 else 60
        pygame.draw.rect(shadow_surf, (0, 0, 0, shadow_alpha),
                         (6, 6, CARD_W, CARD_H), border_radius=16)
        self.screen.blit(shadow_surf,
                         (int(cx) - CARD_W // 2 - 6, int(cy) - CARD_H // 2 - 6))

        # 放置到屏幕
        card_rect = card_surf.get_rect(center=(int(cx), int(cy)))
        self.screen.blit(card_surf, card_rect)

    def _draw_effect_preview(self, card: Card, offset_x: float, cx: int, cy: int):
        """绘制决策影响预览圆圈"""
        effects = card.left_effects if offset_x < 0 else card.right_effects
        element_names = ["火", "水", "风", "土"]
        element_colors = [FIRE_COLOR, WATER_COLOR, WIND_COLOR, EARTH_COLOR]

        # 在HUD元素条上方显示 ±圆圈
        bar_x_start = 20
        for idx, (name, color) in enumerate(zip(element_names, element_colors)):
            x = bar_x_start + idx * 110 + 45  # 元素条中间
            y = HUD_TOP + 25 + 12  # 元素条上方

            delta = effects[idx]
            if delta == 0:
                continue

            sign = "+" if delta > 0 else ""
            delta_text = f"{sign}{delta}"
            delta_color = (0, 255, 0) if delta > 0 else (255, 100, 100)

            # 圆圈背景
            radius = 14 + abs(delta) // 3
            s = pygame.Surface((radius * 2 + 4, radius * 2 + 4), pygame.SRCALPHA)
            pygame.draw.circle(s, (*delta_color, 180), (radius + 2, radius + 2), radius)
            self.screen.blit(s, (x - radius - 2, y - radius - 2))

            # 文字
            dt_surf = self.font_tiny.render(delta_text, True, WHITE)
            dt_rect = dt_surf.get_rect(center=(x, y))
            self.screen.blit(dt_surf, dt_rect)

    def _wrap_text(self, text: str, max_width: int, font: pygame.font.Font) -> list[str]:
        """文字自动换行"""
        lines = []
        current_line = ""
        for char in text:
            test_line = current_line + char
            if font.size(test_line)[0] > max_width:
                lines.append(current_line)
                current_line = char
            else:
                current_line = test_line
        if current_line:
            lines.append(current_line)
        return lines

    def draw_ending(self, ending_id: str, player: Player):
        """绘制结局画面"""
        endings_info = {
            "ending_fire_max":  ("🔥 野心焚身", "你太想进步了。\n\n学生会、竞赛、实习、创业…\n你把生活的一切抛在脑后。\n\n凌晨三点的图书馆，你倒下了。\n\n恶魔低语：\n「如此拼命，也不过是一捧灰烬。」",
                                 "你燃烧了所有，化为灰烬。"),
            "ending_water_max": ("💧 泪海沉沦", "你沉迷于每一段关系。\n\n为每一个微笑心动，\n为每一次冷漠心碎。\n\n你的眼泪汇成了河，\n你的执念筑成了牢。\n\n恶魔低语：\n「爱得太多，和从未爱过，其实一样。」",
                                 "你溺死在自己的眼泪里。"),
            "ending_wind_max":  ("🌪️ 精神囚笼", "你的大脑从未停止运转。\n\n哲学、数学、物理——\n你试图用理性解释一切。\n\n直到现实与妄想混淆，\n你被送进了精神病院。\n\n恶魔低语：\n「想太多的人，最终会困在自己编织的网里。」",
                                 "你困在了自己的思维囚笼中。"),
            "ending_earth_max": ("🪨 黄金坟墓", "钱。钱。钱。\n\n你炒股、兼职、薅羊毛…\n你什么都干。\n\n账户里的数字越来越长，\n但你的心里越来越空。\n\n恶魔低语：\n「你想要的都得到了，可你快乐吗？」",
                                 "你被金钱埋葬。"),
            "ending_fire_min":  ("🔥 行尸走肉", "你失去了所有斗志。\n\n床以外的都是远方，\n手机以外都是异乡。\n\n你在床上躺了不知道多久…\n\n恶魔低语：\n「没有任何渴望的人，身体先于灵魂死去。」",
                                 "你变成了一具空壳。"),
            "ending_water_min": ("💧 永恒的孤独", "你不再信任任何人。\n\n你把所有人都推开，\n把自己关在一个人的世界里。\n\n没有人再记得你。\n\n恶魔低语：\n「最深的孤独，不是没有人爱你，而是你再也不能爱任何人。」",
                                 "你在孤独中消失。"),
            "ending_wind_min":  ("🌪️ 无思之殇", "你的脑子越来越空。\n\n上课听不懂，考试挂科，\n连简单的对话都接不住。\n\n退学通知书寄到了家里…\n\n恶魔低语：\n「失去了思考的能力，你与蝼蚁无异。」",
                                 "你沦为行尸走肉。"),
            "ending_earth_min": ("🪨 寒夜流浪", "你身无分文。\n\n花呗逾期、借呗逾期，\n校园贷催收一个接一个。\n\n那年冬天特别冷…\n\n恶魔低语：\n「没有面包，谁也谈不了诗和远方。」",
                                 "你冻死在校园角落。"),
        }

        info = endings_info.get(ending_id, ("未知结局", "...", "Game Over"))
        title, description, tagline = info

        # 黑色遮罩
        s = pygame.Surface((self.w, self.h), pygame.SRCALPHA)
        s.fill((0, 0, 0, 230))
        self.screen.blit(s, (0, 0))

        # 标题
        title_surf = self.font_large.render(title, True, GOLD_COLOR)
        title_rect = title_surf.get_rect(centerx=self.w // 2, top=100)
        self.screen.blit(title_surf, title_rect)

        # 描述（多行）
        desc_lines = description.split("\n")
        desc_y = 180
        for line in desc_lines:
            if line.startswith("恶魔低语"):
                desc_surf = self.font_small.render(line, True, (231, 76, 60))
            else:
                desc_surf = self.font_medium.render(line, True, WHITE)
            desc_rect = desc_surf.get_rect(centerx=self.w // 2, top=desc_y)
            self.screen.blit(desc_surf, desc_rect)
            desc_y += self.font_medium.get_height() + 4

        # 结算
        stats_y = desc_y + 40
        pygame.draw.line(self.screen, GOLD_COLOR,
                         (80, stats_y), (self.w - 80, stats_y), 1)

        stats = [
            f"存活：{player.week} 周（{player.year_name}）",
            f"火={player.fire}  水={player.water}  风={player.wind}  土={player.earth}",
        ]
        stats_y += 20
        for stat in stats:
            stat_surf = self.font_small.render(stat, True, GOLD_COLOR)
            stat_rect = stat_surf.get_rect(centerx=self.w // 2, top=stats_y)
            self.screen.blit(stat_surf, stat_rect)
            stats_y += 30

        # 提示
        hint_y = self.h - 80
        hint_surf = self.font_small.render("按 R 重新开始 · ESC 返回菜单", True, (150, 150, 150))
        hint_rect = hint_surf.get_rect(centerx=self.w // 2, top=hint_y)
        self.screen.blit(hint_surf, hint_rect)
