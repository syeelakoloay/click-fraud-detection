# 【飞桨学习赛：MarTech Challenge 点击反欺诈预测】第10名方案
飞桨：MarTech Challenge 点击反欺诈预测

## 赛题说明

赛题链接：[飞桨：点击反欺诈预测](https://aistudio.baidu.com/aistudio/competition/detail/52/0/introduction)

### 一、背景介绍 

点击反欺诈预测 广告欺诈是数字营销需要面临的重要挑战之一，点击会欺诈浪费广告主大量金钱，同时对点击数据会产生误导作用。本次比赛提供了约50万次点击数据。特别注意：我们对数据进行了模拟生成，对某些特征含义进行了隐藏，并进行了脱敏处理。 请预测用户的点击行为是否为正常点击，还是作弊行为。点击欺诈预测适用于各种信息流广告投放，banner广告投放，以及百度网盟平台，帮助商家鉴别点击欺诈，锁定精准真实用户。

### 二、任务介绍

测试集中提供了会话sid及该会话的各维度特征值，基于训练集得出的模型进行预测，判断该会话sid是否为作弊行为。

### 三、数据集

选手报名后，可在【数据集】tab获取数据集，以及基线系统。

**训练集**： train.csv （50万条）
**测试集**： test1.csv（15万条）

### 四、字段说明

train.csv和test.csv字段说明

| 字段       | 类型   | 说明                                                         |
| :--------- | :----- | :----------------------------------------------------------- |
| sid        | string | 样本id/请求会话sid                                           |
| package    | string | 媒体信息，包名（已加密）                                     |
| version    | string | 媒体信息，app版本                                            |
| android_id | string | 媒体信息，对外广告位ID（已加密）                             |
| media_id   | string | 媒体信息，对外媒体ID（已加密）                               |
| apptype    | int    | 媒体信息，app所属分类                                        |
| timestamp  | bigint | 请求到达服务时间，单位ms                                     |
| location   | int    | 用户地理位置编码（精确到城市）                               |
| fea_hash   | int    | 用户特征编码（具体物理含义略去）                             |
| fea1_hash  | int    | 用户特征编码（具体物理含义略去）                             |
| cus_type   | int    | 用户特征编码（具体物理含义略去）                             |
| ntt        | int    | 网络类型 0-未知, 1-有线网, 2-WIFI, 3-蜂窝网络未知, 4-2G, 5-3G, 6–4G |
| carrier    | string | 设备使用的运营商 0-未知, 46000-移动, 46001-联通, 46003-电信  |
| os         | string | 操作系统，默认为android                                      |
| osv        | string | 操作系统版本                                                 |
| lan        | string | 设备采用的语言，默认为中文                                   |
| dev_height | int    | 设备高                                                       |
| dev_width  | int    | 设备宽                                                       |
| dev_ppi    | int    | 屏幕分辨率                                                   |

## BaseLine V1_lgb--分数: 86.746

切换盘符：

```
jupyter notebook D:\
```

### 一、数据探索

#### 1、去除Unnameed字段

```python
train = train.iloc[:, 1:]
test = test.iloc[:,1:]
```

#### 2、查看字段类型

**写法1:**

```python
train.info()
```

**写法2:**

或者直接查看类型为object的列

```python
train.select_dtypes(include='object').columns
```

发现以下字段为object类型需要进行数值变换

```
 7   lan         316720 non-null  object 
 10  os          500000 non-null  object 
 11  osv         493439 non-null  object 
 15  version     500000 non-null  object 
 16  fea_hash    500000 non-null  object  
```

以lan为例查看里面数据情况

```python
train['lan'].value_counts()
```

#### 3、查看缺失值的个数

**写法1：**

```python
train.isnull().sum()
```

**写法2：**

```python
t = train.isnull().sum()
t[t>0]
```

发现以下字段缺少比较多

```
lan           183280
osv             6561
```

#### 4、唯一值的个数

查看唯一值的个数

```python
features = train.columns.tolist()
for feature in features:
    print(feature,train[feature].nunique())
```

发现os字段的唯一值个数太少

```
os 2
```

查看os

```python
train['os'].value_counts()
```

发现os数据都为android 

```
android    303175
Android    196825
Name: os, dtype: int64
```

#### 5、数据探索的结论

object类型字段有：lan、osv 、osv、version、fea_hash

缺失值较多的字段有：lan、osv 

唯一值个数较少且意义不大：os

没有意义的字段：sid

BaselineV1中也先去除timestamp

#### 6、特征的相关性分析(补充)

```python
# 对特征列进行相关性分析
import matplotlib.pyplot as plt
%matplotlib inline
import seaborn as sns
plt.figure(figsize=(10,10))
sns.heatmap(train.corr(),cbar=True,annot=True,cmap='Blues')
```





### 二、数据预处理

最终去掉：【lan】【os】【osv】【version】【label】【sid】【timestamp】

```python
remove_list = ['lan', 'os', 'osv', 'version', 'label', 'sid','timestamp']
col = features #字段名
for i in remove_list:
    col.remove(i)
features = train[col]
```

### 三、特征工程

#### 1、fea_hash特征变换

```python
#查看数据值
train['fea_hash'].value_counts()
#查看统计信息
train['fea_hash'].describe()
#查看映射的长度特征情况
train['fea_hash'].map(lambda x:len(str(x))).value_counts()
```

fea_hash进行特征变换

```python
# fea_hash的长度为新特征
features['fea_hash_len'] = features['fea_hash'].map(lambda x: len(str(x)))
features['fea1_hash_len'] = features['fea1_hash'].map(lambda x: len(str(x)))
# 如果fea_hash很长，都归为0，否则为自己的本身
features['fea_hash'] = features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
features['fea1_hash'] = features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
```

### 四、模型建立

test 做和train同样处理，利用lightgbm进行训练与预测，并保存，上诉过程全部合并代码如下：

```python
#BaselineV1
import pandas as pd
import warnings
import lightgbm as lgb
warnings.filterwarnings('ignore')
# 数据加载
train = pd.read_csv('./train.csv')
test = pd.read_csv('./test1.csv')
# 去除Unnameed字段
train = train.iloc[:, 1:]
test = test.iloc[:,1:]
# 去除数据探索发现问题的字段
col = train.columns.tolist()
remove_list = ['lan', 'os', 'osv', 'version', 'label', 'sid','timestamp']
for i in remove_list:
    col.remove(i)
features = train[col]
test_features = test[col]
# fea_hash特征变换
features['fea_hash_len'] = features['fea_hash'].map(lambda x: len(str(x)))
features['fea1_hash_len'] = features['fea1_hash'].map(lambda x: len(str(x)))
features['fea_hash'] = features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
features['fea1_hash'] = features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
test_features['fea_hash_len'] = test_features['fea_hash'].map(lambda x: len(str(x)))
test_features['fea1_hash_len'] = test_features['fea1_hash'].map(lambda x: len(str(x)))
test_features['fea_hash'] = test_features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
test_features['fea1_hash'] = test_features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
#lightgbm进行训练与预测
model = lgb.LGBMClassifier()
model.fit(features,train['label'])
result = model.predict(test_features)
#res包括sid字段与label字段
res = pd.DataFrame(test['sid'])
res['label'] = result
#保存在csv中
res.to_csv('./baselineV1.csv',index=False)
```

## BaseLine V2_lgb--分数: 88.2007

### 一、特征工程优化

#### 1、利用osv特征

```python
# 对osv进行数据清洗
def osv_trans(x):
    x = str(x).replace('Android_', '').replace('Android ', '').replace('W', '')
    if str(x).find('.')>0:
        temp_index1 = x.find('.')
        if x.find(' ')>0:
            temp_index2 = x.find(' ')
        else:
            temp_index2 = len(x)
 
        if x.find('-')>0:
            temp_index2 = x.find('-')
            
        result = x[0:temp_index1] + '.' + x[temp_index1+1:temp_index2].replace('.', '')
        try:
            return float(result)
        except:
            print('有错误: '+x)
            return 0
    try:
        return float(x)
    except:
        print('有错误: '+x)
        return 0
features['osv'].fillna('8.1.0', inplace=True)
features['osv'] = features['osv'].apply(osv_trans)
test_features['osv'].fillna('8.1.0', inplace=True)
test_features['osv'] = test_features['osv'].apply(osv_trans)
```

#### 2、利用TimeStamp特征

提取时间多尺度并计算时间diff(时间差)

```python
# 对timestamp进行数据清洗与特征变换
from datetime import datetime
features['timestamp'] = features['timestamp'].apply(lambda x: datetime.fromtimestamp(x/1000))
test_features['timestamp'] = test_features['timestamp'].apply(lambda x: datetime.fromtimestamp(x/1000))
temp = pd.DatetimeIndex(features['timestamp'])
features['year'] = temp.year
features['month'] = temp.month
features['day'] = temp.day
features['hour'] = temp.hour
features['minute'] = temp.minute
features['week_day'] = temp.weekday #星期几
start_time = features['timestamp'].min()
features['time_diff'] = features['timestamp'] - start_time
features['time_diff'] = features['time_diff'].dt.days + features['time_diff'].dt.seconds/3600/24

temp = pd.DatetimeIndex(test_features['timestamp'])
test_features['year'] = temp.year
test_features['month'] = temp.month
test_features['day'] = temp.day
test_features['hour'] = temp.hour
test_features['minute'] = temp.minute
test_features['week_day'] = temp.weekday #星期几 
test_features['time_diff'] = test_features['timestamp'] - start_time
test_features['time_diff'] = test_features['time_diff'].dt.days + test_features['time_diff'].dt.seconds/3600/24

col = features.columns.tolist()
col.remove('timestamp')
features = features[col]
test_features = test_features[col]
```

#### 3、利用Version特征

```python
# 对version进行数据清洗与特征变换
def version_trans(x):
    if x=='V3':
        return 3
    if x=='v1':
        return 1
    if x=='P_Final_6':
        return 6
    if x=='V6':
        return 6
    if x=='GA3':
        return 3
    if x=='GA2':
        return 2
    if x=='V2':
        return 2
    if x=='50':
        return 5
    return int(x)
features['version'] = features['version'].apply(version_trans)
test_features['version'] = test_features['version'].apply(version_trans)
features['version'] = features['version'].astype('int')
test_features['version'] = test_features['version'].astype('int')
```

### 二、模型建立

上诉过程合并代码如下：

```python
import pandas as pd
import warnings
import lightgbm as lgb
warnings.filterwarnings('ignore')

# 数据加载和去除Unnameed字段
train = pd.read_csv('./train.csv')
test = pd.read_csv('./test1.csv')
train = train.iloc[:, 1:]
test = test.iloc[:,1:]

# 去除数据探索发现问题的字段
col = train.columns.tolist()
remove_list = ['lan', 'os','label', 'sid']
for i in remove_list:
    col.remove(i)
features = train[col]
test_features = test[col]

# 对osv进行数据清洗
def osv_trans(x):
    x = str(x).replace('Android_', '').replace('Android ', '').replace('W', '')
    if str(x).find('.')>0:
        temp_index1 = x.find('.')
        if x.find(' ')>0:
            temp_index2 = x.find(' ')
        else:
            temp_index2 = len(x)
 
        if x.find('-')>0:
            temp_index2 = x.find('-')
            
        result = x[0:temp_index1] + '.' + x[temp_index1+1:temp_index2].replace('.', '')
        try:
            return float(result)
        except:
            print('有错误: '+x)
            return 0
    try:
        return float(x)
    except:
        print('有错误: '+x)
        return 0
features['osv'].fillna('8.1.0', inplace=True)
features['osv'] = features['osv'].apply(osv_trans)
test_features['osv'].fillna('8.1.0', inplace=True)
test_features['osv'] = test_features['osv'].apply(osv_trans)

# 对timestamp进行数据清洗与特征变换,
from datetime import datetime
features['timestamp'] = features['timestamp'].apply(lambda x: datetime.fromtimestamp(x/1000))
test_features['timestamp'] = test_features['timestamp'].apply(lambda x: datetime.fromtimestamp(x/1000))
temp = pd.DatetimeIndex(features['timestamp'])
features['year'] = temp.year
features['month'] = temp.month
features['day'] = temp.day
features['hour'] = temp.hour
features['minute'] = temp.minute
features['week_day'] = temp.weekday #星期几
start_time = features['timestamp'].min()
features['time_diff'] = features['timestamp'] - start_time
features['time_diff'] = features['time_diff'].dt.days + features['time_diff'].dt.seconds/3600/24
temp = pd.DatetimeIndex(test_features['timestamp'])
test_features['year'] = temp.year
test_features['month'] = temp.month
test_features['day'] = temp.day
test_features['hour'] = temp.hour
test_features['minute'] = temp.minute
test_features['week_day'] = temp.weekday #星期几 
test_features['time_diff'] = test_features['timestamp'] - start_time
test_features['time_diff'] = test_features['time_diff'].dt.days + test_features['time_diff'].dt.seconds/3600/24
features = features.drop(['timestamp'],axis = 1)
test_features = test_features.drop(['timestamp'],axis = 1)

# 对version进行数据清洗与特征变换
def version_trans(x):
    if x=='V3':
        return 3
    if x=='v1':
        return 1
    if x=='P_Final_6':
        return 6
    if x=='V6':
        return 6
    if x=='GA3':
        return 3
    if x=='GA2':
        return 2
    if x=='V2':
        return 2
    if x=='50':
        return 5
    return int(x)
features['version'] = features['version'].apply(version_trans)
test_features['version'] = test_features['version'].apply(version_trans)
features['version'] = features['version'].astype('int')
test_features['version'] = test_features['version'].astype('int')

# 对fea_hash与fea1_hash特征变换
features['fea_hash_len'] = features['fea_hash'].map(lambda x: len(str(x)))
features['fea1_hash_len'] = features['fea1_hash'].map(lambda x: len(str(x)))
features['fea_hash'] = features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
features['fea1_hash'] = features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
test_features['fea_hash_len'] = test_features['fea_hash'].map(lambda x: len(str(x)))
test_features['fea1_hash_len'] = test_features['fea1_hash'].map(lambda x: len(str(x)))
test_features['fea_hash'] = test_features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
test_features['fea1_hash'] = test_features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))

#lightgbm进行训练与预测
model = lgb.LGBMClassifier()
model.fit(features,train['label'])
result = model.predict(test_features)
#res包括sid字段与label字段
res = pd.DataFrame(test['sid'])
res['label'] = result
#保存在csv中
res.to_csv('./baselineV2.csv',index=False)
print("已完成")
```

## BaseLine V3_xgb--分数: 88.5073

### 一、特征工程优化

#### 1、构造面积特征和相除特征

```python
features['dev_area'] = features['dev_height'] * features['dev_width']
test_features['dev_area'] = test_features['dev_height'] * test_features['dev_width']
features['dev_rato'] = features['dev_height'] / features['dev_width']
test_features['dev_rato'] = test_features['dev_height'] / test_features['dev_width']
```

#### 2、APP版本与操作系统版本差

```python
features['version_osv'] = features['osv'] - features['version']
test_features['version_osv'] = test_features['osv'] - test_features['version']
```

### 二、xgboost模型

使用xgboost并使用祖传参数

```python
%%time
#lightgbm进行训练与预测
import xgboost as xgb
model_xgb = xgb.XGBClassifier(
            max_depth=15, learning_rate=0.05, n_estimators=5000, 
            objective='binary:logistic', tree_method='gpu_hist', 
            subsample=0.8, colsample_bytree=0.8, 
            min_child_samples=3, eval_metric='auc', reg_lambda=0.5
        )
model_xgb.fit(features,train['label'])
result_xgb = model.predict(test_features)
res = pd.DataFrame(test['sid'])
res['label'] = result_xgb
res.to_csv('./baselineV3.csv',index=False)
print("已完成")
```

xgboost的祖传参数

|       参数        | 含义                                                         |
| :---------------: | :----------------------------------------------------------- |
|     max_depth     | 含义：树的最大深度，用来避免过拟合的。max_depth越大，模型会学到更具体更局部的样本，需要使用CV函数来进行调优。 <br />默认值：6，典型值：3-10。<br />调参：值越大，越容易过拟合；值越小，越容易欠拟合。 |
|   learning_rate   | 含义：学习率，控制每次迭代更新权重时的步长<br />默认值：0.3，典型值：0.01-0.2。 <br />调参：值越小，训练越慢。 |
|   n_estimators    | 总共迭代的次数，即决策树的个数，相当于训练的轮数             |
|     objective     | 回归任务：reg:linear (默认)  reg: logistic <br />二分类  binary:logistic (概率)  binary：logitraw  (类别) <br />多分类  multi：softmax num_class=n (返回类别) multi：softprob  num_class=n(返回概率) |
|    tree_method    | 可调用gpu：gpu_hist。使用功能的树的构建方法，hist代表使用直方图优化的近似贪婪的算法 |
|     subsample     | 含义：训练样本采样率（行采样），训练每棵树时，使用的数据占全部训练集的比例。这个参数控制对于每棵树，随机采样的比例。 减小这个参数的值，算法会更加保守，避免过拟合。但是，如果这个值设置得过小，它可能会导致欠拟合。<br />默认值：1，典型值：0.5-1。<br />调参：防止过拟合。 |
| colsample_bytree  | 含义：训练每棵树时，使用的数据占全部训练集的比例。默认值为1，典型值为0.5-1。和GBM中的subsample参数一模一样。这个参数控制对于每棵树，随机采样的比例。 减小这个参数的值，算法会更加保守，避免过拟合。但是，如果这个值设置得过小，它可能会导致欠拟合。 <br />典型值：0.5-1 <br />调参：防止过拟合。 |
| min_child_samples |                                                              |
|    eval_metric    | 用户可以添加多种评价指标，对于Python用户要以list传递参数对给程序<br />可供的选择如下:  <br />回归任务(默认rmse)  ：rmse--均方根误差         mae--平均绝对误差 <br />分类任务(默认error) ： auc--roc曲线下面积        error--错误率（二分类）    merror--错误率（多分类） logloss--负对数似然函数（二分类）     mlogloss--负对数似然函数（多分类） |
|    reg_lambda     | L2正则化系数                                                 |

可视化的方式查看特征的重要程度

```python
from xgboost import plot_importance
import matplotlib.pyplot as plt
plot_importance(model_xgb)
```

## BaseLine V4_xgb--分数: 88.946

### 一、使用十折交叉验证优化

```python
%%time
# 定义10折子模型
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score
def xgb_model(clf,train_x,train_y,test):
    sk=StratifiedKFold(n_splits=10,random_state=2021,shuffle = True)
    prob=[]
    mean_acc=0
    for k,(train_index,val_index) in enumerate(sk.split(train_x,train_y)):
        train_x_real=train_x.iloc[train_index]
        train_y_real=train_y.iloc[train_index]
        val_x=train_x.iloc[val_index]
        val_y=train_y.iloc[val_index]
        #模型训练及验证集测试
        clf=clf.fit(train_x_real,train_y_real)
        val_y_pred=clf.predict(val_x)
        acc_val=accuracy_score(val_y,val_y_pred)
        print('第{}个子模型 accuracy{}'.format(k+1,acc_val))
        mean_acc+=mean_acc/10
        #预测测试集
        test_y_pred=clf.predict_proba(test)
        prob.append(test_y_pred)
    print(mean_acc)
    mean_prob=sum(prob)/10
    return mean_prob
 
 
import xgboost as xgb
model_xgb2 = xgb.XGBClassifier(
            max_depth=15, learning_rate=0.005, n_estimators=5300, 
            objective='binary:logistic', tree_method='gpu_hist', 
            subsample=0.7, colsample_bytree=0.7, 
            min_child_samples=3, eval_metric='auc', reg_lambda=0.5
        )
result_xgb=xgb_model(model_xgb2,features,train['label'],test_features) 
result_xgb2=[x[1] for x in result_xgb]
result_xgb2=[1 if x>=0.5 else 0 for x in result_xgb2]
 
res = pd.DataFrame(test['sid'])
res['label'] = result_xgb2
res.to_csv('./baselineV4.csv', index=False)
print('已完成')
```



## BaseLine V5_xgb--分数: 89.0787

### 一、特征工程优化

​	通过特征比，寻找关键特征，构造新特征，新特征字段 = 原始特征字段 + 1

```python
#通过特征比，寻找关键特征，构造新特征，新特征字段 = 原始特征字段 + 1
def find_key_feature(train, selected):
    temp = pd.DataFrame(columns = [0,1])
    temp0 = train[train['label'] == 0]
    temp1 = train[train['label'] == 1]
    temp[0] = temp0[selected].value_counts() / len(temp0) * 100
    temp[1] = temp1[selected].value_counts() / len(temp1) * 100
    temp[2] = temp[1] / temp[0]
    #选出大于10倍的特征
    result = temp[temp[2] > 10].sort_values(2, ascending = False).index
    return result

selected_cols = ['osv','apptype', 'carrier', 'dev_height', 'dev_ppi','dev_width', 'media_id', 
                 'package', 'version', 'fea_hash', 'location', 'fea1_hash','cus_type']
key_feature = {}
for selected in selected_cols:
    key_feature[selected] = find_key_feature(train, selected)
key_feature

def f(x, selected):
    if x in key_feature[selected]:
        return 1
    else:
        return 0

for selected in selected_cols:
    if len(key_feature[selected]) > 0:
        features[selected+'1'] = features[selected].apply(f, args = (selected,))
        test_features[selected+'1'] = test_features[selected].apply(f, args = (selected,))
        print(selected+'1 created')
```
## 最终版本 Best_CatBoost--分数: 89.1093
```python
#best版本-89.1093分数
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# 数据加载和去除Unnameed字段
train = pd.read_csv('./train.csv')
test = pd.read_csv('./test1.csv')
train = train.iloc[:, 1:]
test = test.iloc[:,1:]
res = pd.DataFrame(test['sid'])

# 去除数据探索发现问题的字段
col = train.columns.tolist()
remove_list = ['lan', 'os','label', 'sid']
for i in remove_list:
    col.remove(i)
features = train[col]
test_features = test[col]

# 对osv进行数据清洗
def osv_trans(x):
    x = str(x).replace('Android_', '').replace('Android ', '').replace('W', '')
    if str(x).find('.')>0:
        temp_index1 = x.find('.')
        if x.find(' ')>0:
            temp_index2 = x.find(' ')
        else:
            temp_index2 = len(x)
 
        if x.find('-')>0:
            temp_index2 = x.find('-')
            
        result = x[0:temp_index1] + '.' + x[temp_index1+1:temp_index2].replace('.', '')
        try:
            return float(result)
        except:
            print('有错误: '+x)
            return 0
    try:
        return float(x)
    except:
        print('有错误: '+x)
        return 0
features['osv'].fillna('8.1.0', inplace=True)
features['osv'] = features['osv'].apply(osv_trans)
test_features['osv'].fillna('8.1.0', inplace=True)
test_features['osv'] = test_features['osv'].apply(osv_trans)

# 对timestamp进行数据清洗与特征变换,
from datetime import datetime
features['timestamp'] = features['timestamp'].apply(lambda x: datetime.fromtimestamp(x/1000))
test_features['timestamp'] = test_features['timestamp'].apply(lambda x: datetime.fromtimestamp(x/1000))
temp = pd.DatetimeIndex(features['timestamp'])
features['year'] = temp.year
features['month'] = temp.month
features['day'] = temp.day
features['hour'] = temp.hour
features['minute'] = temp.minute
features['week_day'] = temp.weekday #星期几
start_time = features['timestamp'].min()
features['time_diff'] = features['timestamp'] - start_time
features['time_diff'] = features['time_diff'].dt.days + features['time_diff'].dt.seconds/3600/24
temp = pd.DatetimeIndex(test_features['timestamp'])
test_features['year'] = temp.year
test_features['month'] = temp.month
test_features['day'] = temp.day
test_features['hour'] = temp.hour
test_features['minute'] = temp.minute
test_features['week_day'] = temp.weekday #星期几 
test_features['time_diff'] = test_features['timestamp'] - start_time
test_features['time_diff'] = test_features['time_diff'].dt.days + test_features['time_diff'].dt.seconds/3600/24
features = features.drop(['timestamp'],axis = 1)
test_features = test_features.drop(['timestamp'],axis = 1)

# 对version进行数据清洗与特征变换
def version_trans(x):
    if x=='V3':
        return 3
    if x=='v1':
        return 1
    if x=='P_Final_6':
        return 6
    if x=='V6':
        return 6
    if x=='GA3':
        return 3
    if x=='GA2':
        return 2
    if x=='V2':
        return 2
    if x=='50':
        return 5
    return int(x)
features['version'] = features['version'].apply(version_trans)
test_features['version'] = test_features['version'].apply(version_trans)
features['version'] = features['version'].astype('int')
test_features['version'] = test_features['version'].astype('int')

# 对lan进行数据清洗与特征变换 对于有缺失的lan 设置为22    
lan_map = {'zh-CN': 1, 'zh_CN':2, 'Zh-CN': 3, 'zh-cn': 4, 'zh_CN_#Hans':5, 'zh': 6, 'ZH': 7, 'cn':8, 'CN':9, 'zh-HK': 10, 'tw': 11, 'TW': 12, 'zh-TW': 13,             'zh-MO':14, 'en':15, 'en-GB': 16, 'en-US': 17, 'ko': 18, 'ja': 19, 'it': 20, 'mi':21} 
train['lan'] = train['lan'].map(lan_map)
test['lan'] = test['lan'].map(lan_map)
train['lan'].fillna(22, inplace=True)
test['lan'].fillna(22, inplace=True)

# 构造面积特征和构造相除特征
features['dev_area'] = features['dev_height'] * features['dev_width']
test_features['dev_area'] = test_features['dev_height'] * test_features['dev_width']
features['dev_rato'] = features['dev_height'] / features['dev_width']
test_features['dev_rato'] = test_features['dev_height'] / test_features['dev_width']
# APP版本与操作系统版本差
features['version_osv'] = features['osv'] - features['version']
test_features['version_osv'] = test_features['osv'] - test_features['version']

# 对fea_hash与fea1_hash特征变换
features['fea_hash_len'] = features['fea_hash'].map(lambda x: len(str(x)))
features['fea1_hash_len'] = features['fea1_hash'].map(lambda x: len(str(x)))
features['fea_hash'] = features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
features['fea1_hash'] = features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
test_features['fea_hash_len'] = test_features['fea_hash'].map(lambda x: len(str(x)))
test_features['fea1_hash_len'] = test_features['fea1_hash'].map(lambda x: len(str(x)))
test_features['fea_hash'] = test_features['fea_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))
test_features['fea1_hash'] = test_features['fea1_hash'].map(lambda x: 0 if len(str(x))>16 else int(x))

#通过特征比，寻找关键特征，构造新特征，新特征字段 = 原始特征字段 + 1
def find_key_feature(train, selected):
    temp = pd.DataFrame(columns = [0,1])
    temp0 = train[train['label'] == 0]
    temp1 = train[train['label'] == 1]
    temp[0] = temp0[selected].value_counts() / len(temp0) * 100
    temp[1] = temp1[selected].value_counts() / len(temp1) * 100
    temp[2] = temp[1] / temp[0]
    #选出大于10倍的特征
    result = temp[temp[2] > 10].sort_values(2, ascending = False).index
    return result
selected_cols = ['osv','apptype', 'carrier', 'dev_height', 'dev_ppi','dev_width', 'media_id', 
                 'package', 'version', 'fea_hash', 'location', 'fea1_hash','cus_type']
key_feature = {}
for selected in selected_cols:
    key_feature[selected] = find_key_feature(train, selected)
def f(x, selected):
    if x in key_feature[selected]:
        return 1
    else:
        return 0
for selected in selected_cols:
    if len(key_feature[selected]) > 0:
        features[selected+'1'] = features[selected].apply(f, args = (selected,))
        test_features[selected+'1'] = test_features[selected].apply(f, args = (selected,))
        print(selected+'1 created')

#CatBoost模型
from catboost import CatBoostClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score
model=CatBoostClassifier(
            loss_function="Logloss",
            eval_metric="AUC",
            task_type="GPU",
            learning_rate=0.1,
            iterations=1000,
            random_seed=2021,
            od_type="Iter",
            depth=7)

n_folds =10 #十折交叉校验
answers = []
mean_score = 0
data_x=features
data_y=train['label']
sk = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=2021)
all_test = test_features.copy()
for train, test in sk.split(data_x, data_y):  
    x_train = data_x.iloc[train]
    y_train = data_y.iloc[train]
    x_test = data_x.iloc[test]
    y_test = data_y.iloc[test]
    clf = model.fit(x_train,y_train, eval_set=(x_test,y_test),verbose=500) # 500条打印一条日志
    
    yy_pred_valid=clf.predict(x_test,prediction_type='Probability')[:,-1]
    print('cat验证的auc:{}'.format(roc_auc_score(y_test, yy_pred_valid)))
    mean_score += roc_auc_score(y_test, yy_pred_valid) / n_folds
    
    y_pred_valid = clf.predict(all_test,prediction_type='Probability')[:,-1]
    answers.append(y_pred_valid) 
print('mean valAuc:{}'.format(mean_score))
cat_pre=sum(answers)/n_folds
res['label']=[1 if x>=0.5 else 0 for x in cat_pre]
res.to_csv('./LiJing.csv',index=False)
```
