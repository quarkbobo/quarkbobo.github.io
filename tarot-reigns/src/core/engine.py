"""游戏引擎主循环"""

import random
from enum import Enum, auto
from typing import Optional

from core.player import Player
from core.card_system import CardSystem, Card


class GameState(Enum):
    INTRO = auto()          # 序章动画
    MENU = auto()           # 主菜单
    PLAYING = auto()        # 游戏中
    CARD_SWIPING = auto()   # 正在滑卡
    ENDING = auto()         # 结局画面
    PAUSED = auto()         # 暂停


class GameEngine:
    """游戏主引擎"""

    def __init__(self, data_path: str = None):
        self.state = GameState.MENU
        self.player = Player()
        self.card_system = CardSystem(data_path)
        self.current_card: Optional[Card] = None
        self.next_card: Optional[Card] = None            # 预取的下一张牌（牌堆预览）
        self.next_card_after_jump: Optional[str] = None  # 剧情跳转后的卡牌

    def new_game(self):
        """开始新游戏"""
        self.player = Player()
        self.card_system.reset()
        self.state = GameState.INTRO
        # 开局随机获得一张塔罗牌
        import random
        starter_tarots = ["fool", "magician", "strength", "star", "temperance"]
        self.player.tarot_card = random.choice(starter_tarots)

    def draw_card(self) -> Optional[Card]:
        """抽一张卡牌（同时预取下一张用于牌堆预览）"""
        self.current_card = self.card_system.draw(self.player)
        if self.current_card:
            self.state = GameState.CARD_SWIPING
            # 预取下一张 — peek 不能和当前卡重复
            self.next_card = self._peek_next(self.player)
            if self.next_card and self.next_card.id == self.current_card.id:
                self.next_card = self._peek_next(self.player, exclude_id=self.current_card.id)
        else:
            self.state = GameState.PLAYING  # 无卡可抽，等待
            self.next_card = None
        return self.current_card

    def _peek_next(self, player: Player, exclude_id: str = None) -> Optional[Card]:
        """预取下一张卡牌（不消耗队列/once标记）"""
        # 1. pending_cards 队列
        if self.card_system.pending_cards:
            cid = self.card_system.pending_cards[0]
            if cid != exclude_id:
                return self.card_system.cards.get(cid)
            if len(self.card_system.pending_cards) > 1:
                return self.card_system.cards.get(self.card_system.pending_cards[1])

        # 2. 恶魔节点（预览时不算触发）
        demon_card = self.card_system._check_demon_event(player)
        if demon_card and demon_card.id != exclude_id:
            return demon_card

        # 3. 随机池（排除 exclude_id）
        pool = self.card_system._build_pool(player)
        if exclude_id:
            pool = [c for c in pool if c.id != exclude_id]
        if pool:
            return random.choice(pool)
        return None

    def advance_to_next(self):
        """完成当前卡牌后，下一张顶上"""
        self.current_card = self.next_card
        if self.current_card:
            self.next_card = self._peek_next(self.player, exclude_id=self.current_card.id)
        else:
            self.next_card = None
        if self.current_card:
            self.state = GameState.CARD_SWIPING
        else:
            self.state = GameState.PLAYING

    def swipe_left(self):
        """左滑决策"""
        if not self.current_card:
            return None

        card = self.current_card
        effects = card.left_effects
        self.player.modify_elements(*effects)
        self.player.advance_day()

        # 处理塔罗牌授予
        granted = None
        if card.grant_tarot:
            self.player.tarot_card = card.grant_tarot
            granted = card.grant_tarot

        # 剧情跳转
        jump_id = card.left_jump
        self.current_card = None

        ending = self.player.check_game_over()
        if ending:
            self.state = GameState.ENDING
            return {"type": "ending", "ending_id": ending}

        if jump_id:
            self.card_system.queue_card(jump_id)
            self.next_card = None  # 跳转后旧peek失效
            self.state = GameState.PLAYING
            return {"type": "jump", "jump_id": jump_id, "granted": granted}

        self.state = GameState.PLAYING
        return {"type": "continue", "granted": granted}

    def swipe_right(self):
        """右滑决策"""
        if not self.current_card:
            return None

        card = self.current_card
        effects = card.right_effects
        self.player.modify_elements(*effects)
        self.player.advance_day()

        granted = None
        if card.grant_tarot:
            self.player.tarot_card = card.grant_tarot
            granted = card.grant_tarot

        jump_id = card.right_jump
        self.current_card = None

        ending = self.player.check_game_over()
        if ending:
            self.state = GameState.ENDING
            return {"type": "ending", "ending_id": ending}

        if jump_id:
            self.card_system.queue_card(jump_id)
            self.next_card = None  # 跳转后旧peek失效
            self.state = GameState.PLAYING
            return {"type": "jump", "jump_id": jump_id, "granted": granted}

        self.state = GameState.PLAYING
        return {"type": "continue", "granted": granted}

    def use_tarot(self) -> Optional[str]:
        """使用塔罗牌"""
        result = self.player.use_tarot()
        # 死神效果需要补一张塔罗牌
        if self.player.tarot_card is None:
            import random
            available = [k for k in self.card_system.cards if k not in self.card_system.used_ids]
            if available:
                self.player.tarot_card = random.choice(list(self.player.TAROT_DECK.keys()))
        return result
