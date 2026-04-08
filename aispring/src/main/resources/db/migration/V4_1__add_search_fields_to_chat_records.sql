-- 增加联网搜索记录字段
ALTER TABLE chat_records ADD COLUMN search_query TEXT COMMENT '联网搜索词';
ALTER TABLE chat_records ADD COLUMN search_results TEXT COMMENT '联网搜索结果';

ALTER TABLE anonymous_chat_records ADD COLUMN search_query TEXT COMMENT '联网搜索词';
ALTER TABLE anonymous_chat_records ADD COLUMN search_results TEXT COMMENT '联网搜索结果';
