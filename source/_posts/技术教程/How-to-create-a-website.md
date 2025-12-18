---
title: Github免费服务器搭建
date: 2025-11-21
---

# 前记

**quark先是看到sq搭建了服务器，还去问他为啥没有钱（玫幽倩）也能有服务器，看到github开头的傻眼了**

##### **问题来了，搭服务器能干什么呢**

1. **写blog**
2. **ctf比赛：用于上传木马，反射请求**
3. **写网页小游戏玩#可以上网去搜别人现成的代码**

# 相关文章

https://zhuanlan.zhihu.com/p/91652100

\#使用Github做一个完全免费的个人网站(步骤很细)，可以公网显示

https://blog.csdn.net/qq_29493173/article/details/113094143

\#记录了在本地方便管理github的方法

https://zhuanlan.zhihu.com/p/22034763408

\#用cloudfare解析

https://blog.csdn.net/cat_bayi/article/details/128725230

\#Hexo 博客框架搭建个人博客 

https://zhuanlan.zhihu.com/p/385525053

\#hexo博客换主题

https://zhuanlan.zhihu.com/p/618864711

\#Hexo+Next主题搭建个人博客+优化全过程（完整详细版）

**自己去下载git、nodejs、md文件编辑器（我使用的是Typora）**

**我创建好的网址：quark-cpu.github.io、quarkbobo.github.io**





# github服务器搭建

## 设置该账号的默认username 和 email

### git config --global user.name  "name"//自定义用户名

### git config --global user.email "youxiang@qq.com"//

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762238688380-8ceb053b-5d25-432f-a0eb-84443781f7e7.png)

## 配置本地文件夹

右键点开git bash 

### git init:初始化成一个Git可管理的仓库

生成了一个.git

把项目/源代码粘贴到这个本地Git仓库里面

### git add .:把项目/源代码添加到本地仓库暂存区

可以看到，查询状态后文件已经变为绿色，说明add成功

### git commit -m "first commit"

上传到本地仓库中

### git status：查看当前的状态

- 红字表示未add到Git仓库上的文件
- 绿字表示已add到Git仓库上的文件



## github与git的连接——通过ssh-key远程连接

本地Git仓库和GitHub仓库之间的传输是**通过SSH加密传输的**，所以需要配置ssh key。

右键点开git bash，输入

### ssh-keygen -t rsa -C "youxiang@qq.com"#必须是刚刚注册的邮箱

ssh-keygen -t rsa -C "205600691@qq.com"

ssh-keygen -t rsa -b 4096 -C "quark567@outlook.com" -f ~/.ssh/id_rsa_second#想创建第二个服务器的话

按三次回车即可

.ssh默认路径在C:\Users\Lenovo\.ssh

再查看.ssh时，已经有“id_rsa”，“id_rsa.pub”文件。

## 打开github填写SSH Key

打开“Account settings”–“SSH Keys”页面

把刚刚生成id_rsa文件中的所有内容复制进去

右键点开git bash 

ssh -T git@github.com

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762240163395-212e4180-df61-4995-bf7a-2ca35bf6ab35.png)

`github.com` 是 GitHub 的默认主域名。当使用 SSH 连接 GitHub 时，你总是连接到 `github.com`。

#### 但如果有些人想在一台电脑上配置两台服务器怎么办

C:\Users\Lenovo\.ssh下面的config配置文件，根据需求配置即可

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762304073440-e2574706-5ccd-4e52-96e3-182d8e1fa4e9.png)

## 连接服务器仓库

### ssh -T git@github.com

默认是用22端口（http）连接的，报错了。使用443端口（https）连接即可。跳出的弹窗中进行授权，出现提示就是连接成功了。

### git remote add origin https://github.com/quark-cpu/quark-cpu.github.io.git

#### 如果输入错误，可以先删除远程仓库关联，重新写一遍

git remote remove origin

### ![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762306910706-ca8e09e3-4bdc-4887-babc-c72ff376e94e.png)

### 第一次上传时使用git push -u origin master

以后就直接git push 即可

## 建议写一个自动更新的快捷方式自动更新文件夹：

主要的操作为

打开git bash

git add .

git commit -m ""

git push

### 创建快捷方式，填入：

"C:\Program Files\Git\git-bash.exe" --cd="C:\Users\Lenovo\Desktop\你的文件名" -c "git add .; git commit -m \"update $(date '+%Y-%m-%d %H:%M:%S')\"; git push; exec bash"

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762304948963-03e04cdf-110e-4f78-94e8-dc4a5d274654.png)

# 本地安装hexo框架（如果你想写blog，请继续看下去）

其实可以去找免费的企业级别的blog框架，但是我个人还是喜欢浅显易懂方便管理的一个框架hexo

## 首先配置全局和缓存的文件夹方便后面使用

npm config set prefix "C:\Program Files\nodejs\node_global"

npm config set cache "C:\Program Files\nodejs\node_cache"

## 创建一个空文件夹,打开 git bash (需要管理员权限)

```plain
npm install hexo-cli -g
hexo init 
npm install
hexo server
#-->跳转到localhost:4000，就可以看到自己的blog了
#ctrl+c或者关闭窗口已停止
```

下次测试环境只需要输入一个hexo server即可

## 如果本地测试时需要更新数据则使用hexo三连

```
hexo clean
hexo g
hexo d
```

##### emmmm这里我懒得写快捷方式了，反正后面映射到github账号之后这些步骤都没有

打开

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762339554466-c9ba98cc-0b30-4f01-a233-98fd5ed4b909.png)

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762339931610-196000a2-c7a3-4dd5-8bdd-4acb14062781.png)

# 用Cloudfare启动系统服务并映射自己的域名

极力推荐cloudflare！非常好用

## 登录之后找到workers & pages-->点击右上角的create application

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343581486-ff9e97f4-261c-45e2-9e16-a62f55c279ef.png)

## pages->选择第一个

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343672137-9b3dee82-47a2-480d-95ce-69e293078c5d.png)

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343712340-fce9bedb-c156-40ec-8430-06bef9ad70df.png)

## 添加服务器启动时的参数npx hexo generate，和输出文件夹public（默认的）-->save and deploy

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343747580-114ab113-acd7-495f-9ccb-2ce2a78562db.png)

然后等待漫长的二十几秒。

完成之后可以先预览网页，和刚刚的本地看到的内容一样。

### 都做到这里了，把域名也给改了吧

注册免费域名，笔者选择的是[US.KG](https://link.zhihu.com/?target=https%3A//nic.us.kg/)

文章链接：https://www.zhihu.com/question/558934619

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762344955237-b8b84a0a-806a-4464-a692-00f3e78723b2.png)

### 填入刚刚的域名，一路继续，直到这个界面

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762345055555-f85572b7-4f9c-4b37-b385-682e8b24be05.png)

吧这两个解析服务地址写到域名信息里

##### 已试毒，四种域名里只能选.qzz.io和第一个很长的。我选了.qzz.io

每个后缀的域名解析服务地址不太一样，比如.qzz.io和us.kg就不同

接下来就等邮件通知了  #我不想去jbab啊

结果竟然是

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762347014182-deca4d85-4f79-4093-8878-d099a988e687.png)

![img](https://cdn.nlark.com/yuque/0/2025/png/54207903/1762435641656-59cb517d-00cf-424f-926f-66c422fd258e.png)

怎么联想浏览器区别对待啊。我嘞个