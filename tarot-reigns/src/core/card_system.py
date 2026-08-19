"""卡牌系统：加载、筛选、抽取"""

import json
import random
from pathlib import Path
from typing import Optional

from .player import Player


class Card:
    """单张卡牌"""

    def __init__(self, data: dict):
        self.id: str = data["id"]
        self.text: str = data["text"]
        self.left_text: str = data.get("left_text", "拒绝")
        self.right_text: str = data.get("right_text", "同意")
        self.left_effects: list = data.get("left_effects", [0, 0, 0, 0])  # [fire, water, wind, earth]
        self.right_effects: list = data.get("right_effects", [0, 0, 0, 0])
        self.left_jump: Optional[str] = data.get("left_jump")
        self.right_jump: Optional[str] = data.get("right_jump")
        self.image: Optional[str] = data.get("image")      # 卡面图片路径
        self.character: Optional[str] = data.get("character")  # 角色名
        self.condition: Optional[dict] = data.get("condition")  # 出现条件
        self.category: str = data.get("category", "daily")   # intro/daily/special/demon
        self.tags: list = data.get("tags", [])
        self.priority: int = data.get("priority", 0)         # 优先级，越高越优先
        self.once: bool = data.get("once", False)            # 是否只出现一次
        self.grant_tarot: Optional[str] = data.get("grant_tarot")  # 完成后获得的塔罗牌

    def check_condition(self, player: Player) -> bool:
        """检查该卡牌在当前玩家状态下是否可用"""
        if self.condition is None:
            return True

        c = self.condition
        if "fire_min" in c and player.fire < c["fire_min"]:
            return False
        if "fire_max" in c and player.fire > c["fire_max"]:
            return False
        if "water_min" in c and player.water < c["water_min"]:
            return False
        if "water_max" in c and player.water > c["water_max"]:
            return False
        if "wind_min" in c and player.wind < c["wind_min"]:
            return False
        if "wind_max" in c and player.wind > c["wind_max"]:
            return False
        if "earth_min" in c and player.earth < c["earth_min"]:
            return False
        if "earth_max" in c and player.earth > c["earth_max"]:
            return False
        if "week" in c and player.week != c["week"]:
            return False
        if "week_min" in c and player.week < c["week_min"]:
            return False
        if "week_max" in c and player.week > c["week_max"]:
            return False
        if "devil_met" in c and player.devil_met < c["devil_met"]:
            return False
        if "tarot_card" in c and player.tarot_card != c["tarot_card"]:
            return False
        return True


class CardSystem:
    """卡牌管理"""

    def __init__(self, data_path: str = None):
        if data_path is None:
            data_path = Path(__file__).parent.parent.parent / "data" / "cards.json"
        self.cards: dict[str, Card] = {}
        self.used_ids: set[str] = set()
        self.pending_cards: list[str] = []  # 待插入的强制卡牌 ID
        self.load(data_path)

    def load(self, path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for card_data in data.get("cards", []):
            card = Card(card_data)
            self.cards[card.id] = card

        # 设置序章队列
        intro_ids = data.get("intro_sequence", [])
        self.pending_cards = intro_ids.copy()

    def get_card(self, card_id: str) -> Optional[Card]:
        return self.cards.get(card_id)

    def draw(self, player: Player) -> Optional[Card]:
        """抽取一张卡牌"""
        # 1. 优先处理待插入的强制卡牌
        if self.pending_cards:
            cid = self.pending_cards.pop(0)
            card = self.cards.get(cid)
            if card:
                return card

        # 2. 检查恶魔节点
        demon_card = self._check_demon_event(player)
        if demon_card:
            return demon_card

        # 3. 从随机池抽取
        pool = self._build_pool(player)
        if not pool:
            return None

        # 按优先级权重选卡
        card = self._weighted_choice(pool)

        # 记录已使用
        if card.once:
            self.used_ids.add(card.id)

        # 应用月亮效果
        if player.moon_count > 0 and card.category != "demon":
            card = self._randomize_card(card)

        return card

    def _check_demon_event(self, player: Player) -> Optional[Card]:
        """检查是否触发恶魔事件"""
        if player.devil_met >= 3:
            return None

        demon_weeks = [30, 82, 134]  # 三场舞会
        target_week = demon_weeks[player.devil_met]
        if player.week == target_week:
            demon_card_id = f"dev{player.devil_met + 1}_1"
            card = self.cards.get(demon_card_id)
            if card:
                player.devil_met += 1
                return card
        return None

    def _build_pool(self, player: Player) -> list[Card]:
        """构建可用卡牌池"""
        pool = []
        for card in self.cards.values():
            if card.category in ("intro", "demon"):
                continue
            if card.once and card.id in self.used_ids:
                continue
            if not card.check_condition(player):
                continue
            pool.append(card)
        return pool

    def _weighted_choice(self, pool: list[Card]) -> Card:
        """加权随机选择"""
        max_priority = max((c.priority for c in pool), default=0) + 1
        weights = [max_priority + c.priority for c in pool]
        return random.choices(pool, weights=weights, k=1)[0]

    def _randomize_card(self, card: Card) -> Card:
        """月亮效果：随机化卡牌效果"""
        import copy
        new_card = copy.copy(card)
        for i in range(4):
            new_card.left_effects[i] = random.randint(-card.left_effects[i], card.left_effects[i]) if card.left_effects[i] else 0
            new_card.right_effects[i] = random.randint(-card.right_effects[i], card.right_effects[i]) if card.right_effects[i] else 0
        return new_card

    def queue_card(self, card_id: str):
        """将卡牌插入队列头部"""
        self.pending_cards.insert(0, card_id)

    def reset(self):
        self.used_ids.clear()
