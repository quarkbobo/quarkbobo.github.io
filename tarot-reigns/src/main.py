"""Tarot Reigns — 主入口"""

import sys
import os
import pygame

# 确保 src 在 path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.engine import GameEngine, GameState
from ui.renderer import Renderer

WINDOW_W, WINDOW_H = 480, 720
FPS = 60


class TarotReignsGame:
    """游戏主类"""

    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WINDOW_W, WINDOW_H))
        pygame.display.set_caption("Tarot Reigns · 塔罗统治")
        self.clock = pygame.time.Clock()

        data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "..", "data", "cards.json")
        self.engine = GameEngine(data_path)
        self.renderer = Renderer(self.screen)

        # 卡牌拖动状态
        self.dragging = False
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.drag_offset_x = 0
        self.drag_offset_y = 0

        # 动画状态
        self.animating = False
        self.anim_target_x = 0
        self.anim_start_x = 0
        self.anim_progress = 0
        self.anim_duration = 0.3  # 秒

        self.running = True

    def run(self):
        """主循环"""
        # 先画菜单
        self._show_menu()

        while self.running:
            dt = self.clock.tick(FPS) / 1000.0

            for event in pygame.event.get():
                self._handle_event(event)

            self._update(dt)
            self._render()
            pygame.display.flip()

        pygame.quit()
        sys.exit()

    def _handle_event(self, event):
        if event.type == pygame.QUIT:
            self.running = False

        elif event.type == pygame.KEYDOWN:
            self._handle_key(event.key)

        elif event.type == pygame.MOUSEBUTTONDOWN:
            self._handle_mouse_down(event.pos)

        elif event.type == pygame.MOUSEMOTION:
            self._handle_mouse_move(event.pos)

        elif event.type == pygame.MOUSEBUTTONUP:
            self._handle_mouse_up(event.pos)

    def _handle_key(self, key):
        if self.engine.state == GameState.ENDING:
            if key == pygame.K_r:
                self.engine.new_game()
                self.engine.draw_card()
            elif key == pygame.K_ESCAPE:
                self._show_menu()

        elif self.engine.state == GameState.PLAYING:
            if key == pygame.K_SPACE:
                result = self.engine.use_tarot()
                print(f"[塔罗牌] {result}")

        elif self.engine.state == GameState.CARD_SWIPING:
            if key == pygame.K_ESCAPE:
                self._show_menu()

    def _handle_mouse_down(self, pos):
        if self.engine.state != GameState.CARD_SWIPING:
            # 序章/PLAYING — 点击任意位置即可抽卡
            if self.engine.state in (GameState.INTRO, GameState.PLAYING):
                self.engine.draw_card()
            return

        if self.animating:
            return

        # 检查是否点击了左右快捷区域（点击即滑）
        edge_width = 80
        if pos[0] < edge_width:
            # 左边缘点击 → 左滑
            result = self.engine.swipe_left()
            self._process_swipe_result(result)
            return
        elif pos[0] > self.screen.get_width() - edge_width:
            # 右边缘点击 → 右滑
            result = self.engine.swipe_right()
            self._process_swipe_result(result)
            return

        # 检查点击是否在卡牌区域（拖拽模式）
        cx, cy = self.screen.get_width() // 2, self.screen.get_height() // 2 + 20
        card_rect = pygame.Rect(cx - 170, cy - 240, 340, 480)
        if card_rect.collidepoint(pos):
            self.dragging = True
            self.drag_start_x = pos[0]
            self.drag_start_y = pos[1]
            self.drag_offset_x = 0
            self.drag_offset_y = 0

    def _handle_mouse_move(self, pos):
        if not self.dragging:
            return
        self.drag_offset_x = pos[0] - self.drag_start_x
        self.drag_offset_y = pos[1] - self.drag_start_y

    def _handle_mouse_up(self, pos):
        if not self.dragging:
            return
        self.dragging = False

        # 判断是否完成滑动
        threshold = 340 * 0.5  # 卡牌宽度的 50%
        if abs(self.drag_offset_x) > threshold:
            if self.drag_offset_x < 0:
                result = self.engine.swipe_left()
            else:
                result = self.engine.swipe_right()

            if result and result["type"] == "ending":
                print(f"[结局] {result['ending_id']}")
            elif result and result.get("granted"):
                print(f"[获得塔罗牌] {result['granted']}")

            # 自动抽下一张
            if self.engine.state in (GameState.PLAYING, GameState.INTRO):
                self._advance_card()
        else:
            # 回弹
            self._animate_bounce()

        self.drag_offset_x = 0
        self.drag_offset_y = 0

    def _process_swipe_result(self, result):
        """处理滑动/点击结果"""
        if not result:
            return
        if result["type"] == "ending":
            print(f"[结局] {result['ending_id']}")
        elif result.get("granted"):
            print(f"[获得塔罗牌] {result['granted']}")

        # 自动抽下一张
        if self.engine.state in (GameState.PLAYING, GameState.INTRO):
            self._advance_card()

    def _advance_card(self):
        """无缝推进到下一张牌"""
        if self.engine.next_card:
            self.engine.advance_to_next()
        else:
            self.engine.draw_card()

    def _animate_bounce(self):
        """卡牌回弹动画"""
        self.animating = True
        self.anim_start_x = self.drag_offset_x
        self.anim_progress = 0

    def _update(self, dt):
        if self.animating:
            self.anim_progress += dt / self.anim_duration
            if self.anim_progress >= 1.0:
                self.anim_progress = 1.0
                self.animating = False
                self.engine.state = GameState.CARD_SWIPING

            # 缓动回弹
            t = self.anim_progress
            self.drag_offset_x = self.anim_start_x * (1 - t * t * (3 - 2 * t))
            self.drag_offset_y = 0

    def _render(self):
        self.renderer.draw_background()

        if self.engine.state == GameState.MENU:
            self._render_menu()

        elif self.engine.state in (GameState.INTRO, GameState.PLAYING):
            self.renderer.draw_hud(self.engine.player)
            self._render_play_state()

        elif self.engine.state == GameState.CARD_SWIPING:
            self.renderer.draw_hud(self.engine.player)
            self._render_card_swiping()

        elif self.engine.state == GameState.ENDING:
            ending_id = self.engine.player.check_game_over()
            if ending_id:
                self.renderer.draw_ending(ending_id, self.engine.player)

    def _render_play_state(self):
        """闲置状态 — 提示抽卡"""
        self.renderer.draw_hud(self.engine.player)

        # 提示文字
        hint = self.renderer.font_medium.render("点击屏幕抽取下一张卡牌", True, (200, 200, 200))
        hint_rect = hint.get_rect(center=(self.screen.get_width() // 2,
                                           self.screen.get_height() - 60))
        self.screen.blit(hint, hint_rect)

        # 塔罗牌提示
        if self.engine.player.tarot_card:
            tarot_hint = self.renderer.font_small.render("空格键使用塔罗牌", True, (150, 150, 150))
            th_rect = tarot_hint.get_rect(center=(self.screen.get_width() // 2,
                                                    self.screen.get_height() - 30))
            self.screen.blit(tarot_hint, th_rect)

    def _render_card_swiping(self):
        """卡牌滑动状态"""
        card = self.engine.current_card
        if not card:
            return

        # 先画下一张牌（在底下露出一角）
        if self.engine.next_card and abs(self.drag_offset_x) < 20:
            self.renderer.draw_card_peek(self.engine.next_card)

        rotation = self.drag_offset_x * 0.05  # 轻微旋转
        alpha = 255 - int(abs(self.drag_offset_x) / 340 * 60)  # 稍微变透明

        show_effects = abs(self.drag_offset_x) > 340 * 0.25

        self.renderer.draw_card(
            card,
            offset_x=self.drag_offset_x,
            offset_y=self.drag_offset_y,
            rotation=rotation,
            alpha=alpha,
            show_effects=show_effects,
        )

        # 左右决策提示（静止时显示）和边缘可点击区域
        edge_width = 80
        if abs(self.drag_offset_x) < 20:
            # 左侧点击区域
            left_zone = pygame.Surface((edge_width, self.screen.get_height()), pygame.SRCALPHA)
            left_zone.fill((231, 76, 60, 15))  # 半透明红
            self.screen.blit(left_zone, (0, 0))

            # 右侧点击区域
            right_zone = pygame.Surface((edge_width, self.screen.get_height()), pygame.SRCALPHA)
            right_zone.fill((39, 174, 96, 15))  # 半透明绿
            self.screen.blit(right_zone, (self.screen.get_width() - edge_width, 0))

            # 文字提示
            left_hint = self.renderer.font_medium.render("← 否", True, (231, 76, 60))
            right_hint = self.renderer.font_medium.render("是 →", True, (39, 174, 96))
            left_rect = left_hint.get_rect(center=(edge_width // 2, self.screen.get_height() // 2))
            right_rect = right_hint.get_rect(center=(self.screen.get_width() - edge_width // 2, self.screen.get_height() // 2))
            self.screen.blit(left_hint, left_rect)
            self.screen.blit(right_hint, right_rect)

            # 提示拖拽
            drag_hint = self.renderer.font_tiny.render("或拖拽卡牌左右滑动", True, (150, 150, 150))
            dh_rect = drag_hint.get_rect(center=(self.screen.get_width() // 2, self.screen.get_height() - 30))
            self.screen.blit(drag_hint, dh_rect)

    def _render_menu(self):
        """主菜单（主循环中使用）"""
        self._render_menu_base()

        # 菜单选项（静态文字，主循环中无悬停）
        menu_items = [
            ("N - 新游戏", 380),
            ("E - 编辑器", 420),
            ("Q - 退出", 460),
        ]
        for text, y in menu_items:
            item = self.renderer.font_small.render(text, True, (220, 220, 220))
            self.screen.blit(item, (self.screen.get_width() // 2 - item.get_width() // 2, y))

        self._render_menu_decor()

    def _render_menu_widgets(self, menu_buttons):
        """主菜单（独立循环，带鼠标悬停）"""
        self._render_menu_base()

        for btn in menu_buttons:
            # 按钮背景（悬停时）
            if btn["color"] == (255, 215, 0):
                bg = pygame.Surface((btn["rect"].width, btn["rect"].height), pygame.SRCALPHA)
                bg.fill((255, 215, 0, 30))
                self.screen.blit(bg, (btn["rect"].x, btn["rect"].y))

            # 按钮文字
            item = self.renderer.font_medium.render(btn["label"], True, btn["color"])
            item_rect = item.get_rect(center=btn["rect"].center)
            self.screen.blit(item, item_rect)

            # 键盘快捷键提示
            key_map = {"new": "N", "editor": "E", "quit": "Q"}
            hint = self.renderer.font_tiny.render(f"按 {key_map[btn['action']]} 或点击", True, (120, 120, 120))
            hint_rect = hint.get_rect(centerx=btn["rect"].centerx, top=btn["rect"].bottom + 2)
            self.screen.blit(hint, hint_rect)

        self._render_menu_decor()

    def _render_menu_base(self):
        """菜单公共元素：标题、装饰线"""
        # 标题
        title_shadow = self.renderer.font_large.render("Tarot Reigns", True, (0, 0, 0))
        title = self.renderer.font_large.render("Tarot Reigns", True, (212, 165, 116))
        self.screen.blit(title_shadow, (self.screen.get_width() // 2 - title.get_width() // 2 + 2, 202))
        self.screen.blit(title, (self.screen.get_width() // 2 - title.get_width() // 2, 200))

        subtitle = self.renderer.font_medium.render("塔罗统治", True, (200, 200, 200))
        self.screen.blit(subtitle, (self.screen.get_width() // 2 - subtitle.get_width() // 2, 260))

        # 装饰线
        pygame.draw.line(self.screen, (212, 165, 116),
                         (self.screen.get_width() // 2 - 100, 300),
                         (self.screen.get_width() // 2 + 100, 300), 2)

    def _render_menu_decor(self):
        """菜单装饰：塔罗牌背景"""
        import random
        random.seed(42)
        for i in range(5):
            rot = random.randint(-15, 15)
            x = random.randint(40, self.screen.get_width() - 40)
            deco = self.renderer.font_large.render("🃏", True, (60, 60, 100))
            deco = pygame.transform.rotate(deco, rot)
            self.screen.blit(deco, (x - deco.get_width() // 2, 500 + i * 20))

    def _show_menu(self):
        self.engine.state = GameState.MENU

        # 定义菜单按钮的点击区域
        menu_buttons = [
            {"label": "新 游 戏", "key": pygame.K_n, "action": "new",
             "rect": pygame.Rect(0, 0, 280, 44)},
            {"label": "编 辑 器", "key": pygame.K_e, "action": "editor",
             "rect": pygame.Rect(0, 0, 280, 44)},
            {"label": "退    出", "key": pygame.K_q, "action": "quit",
             "rect": pygame.Rect(0, 0, 280, 44)},
        ]
        # 设置按钮位置
        btn_x = self.screen.get_width() // 2 - 140
        btn_positions = [380, 430, 480]
        for btn, y in zip(menu_buttons, btn_positions):
            btn["rect"].x = btn_x
            btn["rect"].y = y - 22
            btn["color"] = (220, 220, 220)

        while self.running and self.engine.state == GameState.MENU:
            mouse_pos = pygame.mouse.get_pos()

            # 更新按钮悬停状态
            for btn in menu_buttons:
                if btn["rect"].collidepoint(mouse_pos):
                    btn["color"] = (255, 215, 0)  # 金色高亮
                else:
                    btn["color"] = (220, 220, 220)

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                    return
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_n:
                        self.engine.new_game()
                        self.engine.draw_card()
                        return
                    elif event.key == pygame.K_e:
                        self._launch_editor()
                        return
                    elif event.key == pygame.K_q:
                        self.running = False
                        return
                elif event.type == pygame.MOUSEBUTTONDOWN:
                    for btn in menu_buttons:
                        if btn["rect"].collidepoint(event.pos):
                            if btn["action"] == "new":
                                self.engine.new_game()
                                self.engine.draw_card()
                                return
                            elif btn["action"] == "editor":
                                self._launch_editor()
                                return
                            elif btn["action"] == "quit":
                                self.running = False
                                return

            self._render_menu_widgets(menu_buttons)
            pygame.display.flip()
            self.clock.tick(FPS)

    def _launch_editor(self):
        """启动编辑器"""
        try:
            import subprocess
            editor_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                       "editor", "editor_main.py")
            subprocess.Popen([sys.executable, editor_path])
        except Exception as e:
            print(f"启动编辑器失败: {e}")


def main():
    game = TarotReignsGame()
    game.run()


if __name__ == "__main__":
    main()
