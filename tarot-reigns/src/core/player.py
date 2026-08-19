"""玩家状态管理：四元素、时间、塔罗牌"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import random


class Element(Enum):
    FIRE = "fire"       # 火 - 野心
    WATER = "water"     # 水 - 情感
    WIND = "wind"       # 风 - 思维
    EARTH = "earth"     # 土 - 资金


# 塔罗牌定义
TAROT_DECK = {
    "fool":         {"name": "愚者",   "desc": "一切归于原点",           "effect": "reset"},
    "magician":     {"name": "魔术师", "desc": "四元素各+20",            "effect": "all_plus_20"},
    "high_priestess": {"name": "女祭司","desc": "随机两项±15",           "effect": "random_two_15"},
    "emperor":      {"name": "皇帝",   "desc": "火+30，水-10",           "effect": "emperor"},
    "lovers":       {"name": "恋人",   "desc": "水+25，风-5",            "effect": "lovers"},
    "chariot":      {"name": "战车",   "desc": "火+20，风+15",           "effect": "chariot"},
    "strength":     {"name": "力量",   "desc": "全部+10",               "effect": "all_plus_10"},
    "hermit":       {"name": "隐者",   "desc": "风+30，火-10",           "effect": "hermit"},
    "wheel":        {"name": "命运之轮","desc": "四元素随机±10~20",      "effect": "wheel"},
    "justice":      {"name": "正义",   "desc": "最高-20，最低+20",        "effect": "justice"},
    "hanged_man":   {"name": "倒吊人", "desc": "时间+7天，全部-5",        "effect": "hanged_man"},
    "death":        {"name": "死神",   "desc": "全部-15，获得新塔罗牌",    "effect": "death"},
    "temperance":   {"name": "节制",   "desc": "全部向50靠近15",         "effect": "temperance"},
    "devil":        {"name": "恶魔",   "desc": "全部+25，下张卡后果翻倍",  "effect": "devil"},
    "tower":        {"name": "塔",     "desc": "随机一项归零，其他+15",    "effect": "tower"},
    "star":         {"name": "星星",   "desc": "全部+15",               "effect": "all_plus_15"},
    "moon":         {"name": "月亮",   "desc": "下三张卡牌效果随机化",     "effect": "moon"},
    "sun":          {"name": "太阳",   "desc": "全部+20，时间-3天",       "effect": "sun"},
    "judgement":    {"name": "审判",   "desc": "全部变为60",             "effect": "judgement"},
    "world":        {"name": "世界",   "desc": "全部+25",               "effect": "all_plus_25"},
}


@dataclass
class Player:
    fire: int = 50
    water: int = 50
    wind: int = 50
    earth: int = 50
    day: int = 1
    tarot_card: Optional[str] = None  # tarot card key
    devil_met: int = 0               # 遇到恶魔次数
    moon_count: int = 0              # 月亮的剩余生效次数
    devil_double: bool = False       # 恶魔卡牌效果翻倍

    def get_element(self, e: Element) -> int:
        return getattr(self, e.value)

    def set_element(self, e: Element, value: int):
        setattr(self, e.value, max(0, min(100, value)))

    def modify_elements(self, fire: int = 0, water: int = 0, wind: int = 0, earth: int = 0):
        """修改四元素，自动 clamp 到 0-100"""
        if self.devil_double:
            fire *= 2
            water *= 2
            wind *= 2
            earth *= 2
            self.devil_double = False

        self.fire = max(0, min(100, self.fire + fire))
        self.water = max(0, min(100, self.water + water))
        self.wind = max(0, min(100, self.wind + wind))
        self.earth = max(0, min(100, self.earth + earth))

    @property
    def week(self) -> int:
        return (self.day - 1) // 7 + 1

    @property
    def year(self) -> int:
        return (self.week - 1) // 52 + 1

    @property
    def year_name(self) -> str:
        y = self.year
        return {1: "大一", 2: "大二", 3: "大三", 4: "大四"}.get(y, f"第{y}年")

    def advance_day(self):
        self.day += 1
        if self.moon_count > 0:
            self.moon_count -= 1

    def check_game_over(self) -> Optional[str]:
        """检查是否触发结局，返回结局ID"""
        if self.fire >= 100:
            return "ending_fire_max"
        if self.water >= 100:
            return "ending_water_max"
        if self.wind >= 100:
            return "ending_wind_max"
        if self.earth >= 100:
            return "ending_earth_max"
        if self.fire <= 0:
            return "ending_fire_min"
        if self.water <= 0:
            return "ending_water_min"
        if self.wind <= 0:
            return "ending_wind_min"
        if self.earth <= 0:
            return "ending_earth_min"
        return None

    def use_tarot(self) -> Optional[str]:
        """使用塔罗牌，返回生效信息"""
        if not self.tarot_card:
            return "没有可用的塔罗牌"

        card_key = self.tarot_card
        self.tarot_card = None
        card_data = TAROT_DECK.get(card_key)
        if not card_data:
            return "未知的塔罗牌"

        effect = card_data["effect"]
        self._apply_tarot_effect(effect)

        return f"使用了「{card_data['name']}」：{card_data['desc']}"

    def _apply_tarot_effect(self, effect: str):
        """执行塔罗牌效果"""
        if effect == "reset":
            self.fire = self.water = self.wind = self.earth = 50
            self.day = max(1, self.day - 7)
        elif effect == "all_plus_20":
            self.modify_elements(20, 20, 20, 20)
        elif effect == "random_two_15":
            elements = [Element.FIRE, Element.WATER, Element.WIND, Element.EARTH]
            chosen = random.sample(elements, 2)
            for e in chosen:
                delta = random.choice([-15, 15])
                self.set_element(e, self.get_element(e) + delta)
        elif effect == "emperor":
            self.modify_elements(fire=30, water=-10)
        elif effect == "lovers":
            self.modify_elements(water=25, wind=-5)
        elif effect == "chariot":
            self.modify_elements(fire=20, wind=15)
        elif effect == "all_plus_10":
            self.modify_elements(10, 10, 10, 10)
        elif effect == "hermit":
            self.modify_elements(fire=-10, wind=30)
        elif effect == "wheel":
            self.modify_elements(
                fire=random.randint(-20, 20),
                water=random.randint(-20, 20),
                wind=random.randint(-20, 20),
                earth=random.randint(-20, 20),
            )
        elif effect == "justice":
            vals = {"fire": self.fire, "water": self.water, "wind": self.wind, "earth": self.earth}
            max_key = max(vals, key=vals.get)
            min_key = min(vals, key=vals.get)
            self.set_element(Element(max_key), vals[max_key] - 20)
            self.set_element(Element(min_key), vals[min_key] + 20)
        elif effect == "hanged_man":
            self.modify_elements(-5, -5, -5, -5)
            self.day = max(1, self.day + 7)
        elif effect == "death":
            self.modify_elements(-15, -15, -15, -15)
            # 获得新塔罗牌 — 由外部处理
        elif effect == "temperance":
            for e in [Element.FIRE, Element.WATER, Element.WIND, Element.EARTH]:
                cur = self.get_element(e)
                diff = 50 - cur
                adj = 15 if diff > 0 else -15
                self.set_element(e, cur + (adj if abs(diff) >= 15 else diff))
        elif effect == "devil":
            self.modify_elements(25, 25, 25, 25)
            self.devil_double = True
        elif effect == "tower":
            elements = [Element.FIRE, Element.WATER, Element.WIND, Element.EARTH]
            target = random.choice(elements)
            self.set_element(target, 0)
            for e in elements:
                if e != target:
                    self.set_element(e, self.get_element(e) + 15)
        elif effect == "all_plus_15":
            self.modify_elements(15, 15, 15, 15)
        elif effect == "moon":
            self.moon_count = 3
        elif effect == "sun":
            self.modify_elements(20, 20, 20, 20)
            self.day = max(1, self.day - 3)
        elif effect == "judgement":
            self.fire = self.water = self.wind = self.earth = 60
        elif effect == "all_plus_25":
            self.modify_elements(25, 25, 25, 25)

    def to_dict(self) -> dict:
        return {
            "fire": self.fire,
            "water": self.water,
            "wind": self.wind,
            "earth": self.earth,
            "day": self.day,
            "tarot_card": self.tarot_card,
            "devil_met": self.devil_met,
            "moon_count": self.moon_count,
            "devil_double": self.devil_double,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Player":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})
