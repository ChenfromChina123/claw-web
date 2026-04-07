import pygame
import random
import math
import sys

# 初始化pygame
pygame.init()

# 设置窗口尺寸
WIDTH, HEIGHT = 1000, 700
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("烟花模拟 - Python Fireworks")

# 颜色定义
BLACK = (0, 0, 0)
COLORS = [
    (255, 50, 50),    # 红色
    (50, 255, 50),    # 绿色
    (50, 50, 255),    # 蓝色
    (255, 255, 50),   # 黄色
    (255, 50, 255),   # 紫色
    (50, 255, 255),   # 青色
    (255, 150, 50),   # 橙色
    (255, 255, 255),  # 白色
]

class Particle:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.color = color
        self.radius = random.randint(1, 3)
        self.speed = random.uniform(2, 6)
        self.angle = random.uniform(0, 2 * math.pi)
        self.vx = math.cos(self.angle) * self.speed
        self.vy = math.sin(self.angle) * self.speed
        self.gravity = 0.1
        self.life = 100  # 粒子寿命
        self.alpha = 255  # 透明度
    
    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += self.gravity
        self.life -= 1
        self.alpha = int(self.life * 2.55)  # 随寿命减少透明度
        
    def draw(self, surface):
        if self.life > 0:
            # 创建带透明度的颜色
            color_with_alpha = (
                min(255, self.color[0]),
                min(255, self.color[1]),
                min(255, self.color[2])
            )
            # 绘制粒子
            pygame.draw.circle(
                surface, 
                color_with_alpha, 
                (int(self.x), int(self.y)), 
                self.radius
            )
            # 绘制光晕效果
            pygame.draw.circle(
                surface,
                (color_with_alpha[0]//2, color_with_alpha[1]//2, color_with_alpha[2]//2),
                (int(self.x), int(self.y)),
                self.radius + 2,
                1
            )
    
    def is_dead(self):
        return self.life <= 0

class Firework:
    def __init__(self):
        self.x = random.randint(100, WIDTH - 100)
        self.y = HEIGHT
        self.color = random.choice(COLORS)
        self.speed = random.uniform(5, 8)
        self.particles = []
        self.exploded = False
        self.target_y = random.randint(50, HEIGHT // 2)
    
    def update(self):
        if not self.exploded:
            self.y -= self.speed
            # 绘制上升轨迹
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 2)
            
            # 到达目标高度时爆炸
            if self.y <= self.target_y:
                self.explode()
        else:
            # 更新所有粒子
            for particle in self.particles[:]:
                particle.update()
                if particle.is_dead():
                    self.particles.remove(particle)
    
    def explode(self):
        self.exploded = True
        # 创建爆炸粒子
        particle_count = random.randint(80, 150)
        for _ in range(particle_count):
            self.particles.append(Particle(self.x, self.y, self.color))
    
    def draw(self):
        if not self.exploded:
            # 绘制上升的烟花
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 4)
            # 绘制尾迹
            for i in range(5):
                pygame.draw.circle(
                    screen, 
                    self.color, 
                    (int(self.x), int(self.y) + i * 3), 
                    2 - i * 0.3
                )
        else:
            # 绘制所有粒子
            for particle in self.particles:
                particle.draw(screen)
    
    def is_done(self):
        return self.exploded and len(self.particles) == 0

def main():
    clock = pygame.time.Clock()
    fireworks = []
    running = True
    font = pygame.font.SysFont(None, 24)
    
    # 添加初始烟花
    for _ in range(3):
        fireworks.append(Firework())
    
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    # 空格键添加新烟花
                    for _ in range(3):
                        fireworks.append(Firework())
            elif event.type == pygame.MOUSEBUTTONDOWN:
                # 鼠标点击添加烟花
                fireworks.append(Firework())
        
        # 填充黑色背景
        screen.fill(BLACK)
        
        # 绘制星星背景
        for _ in range(5):  # 每帧添加几个新星星
            if random.random() < 0.1:
                x = random.randint(0, WIDTH)
                y = random.randint(0, HEIGHT // 3)
                size = random.randint(1, 3)
                brightness = random.randint(150, 255)
                pygame.draw.circle(screen, (brightness, brightness, brightness), (x, y), size)
        
        # 更新和绘制烟花
        for firework in fireworks[:]:
            firework.update()
            firework.draw()
            if firework.is_done():
                fireworks.remove(firework)
        
        # 随机添加新烟花
        if random.random() < 0.03 and len(fireworks) < 15:
            fireworks.append(Firework())
        
        # 显示说明文字
        instructions = [
            "空格键: 发射一组烟花",
            "鼠标点击: 发射单个烟花",
            "ESC键: 退出程序",
            f"当前烟花数量: {len(fireworks)}"
        ]
        
        for i, text in enumerate(instructions):
            text_surface = font.render(text, True, (200, 200, 200))
            screen.blit(text_surface, (10, 10 + i * 25))
        
        pygame.display.flip()
        clock.tick(60)
    
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
