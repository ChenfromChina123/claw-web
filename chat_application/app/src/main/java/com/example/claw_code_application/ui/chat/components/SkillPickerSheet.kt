package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ClawCodeApplication
import com.example.claw_code_application.data.api.models.SkillCategory
import com.example.claw_code_application.data.api.models.SkillDefinition
import com.example.claw_code_application.data.repository.SkillRepository
import com.example.claw_code_application.ui.chat.SkillAttachment
import com.example.claw_code_application.ui.theme.AppColor
import kotlinx.coroutines.launch

/**
 * 技能选择底部弹窗
 * 展示所有可用技能，用户点击选择后附加到消息中
 *
 * @param onDismiss 关闭回调
 * @param onSkillSelected 选择技能回调
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillPickerSheet(
    onDismiss: () -> Unit,
    onSkillSelected: (SkillAttachment) -> Unit
) {
    val colors = AppColor.current
    val scope = rememberCoroutineScope()

    var skills by remember { mutableStateOf<List<SkillDefinition>>(emptyList()) }
    var categories by remember { mutableStateOf<List<SkillCategory>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val skillRepository = remember {
        SkillRepository(ClawCodeApplication.apiService)
    }

    LaunchedEffect(Unit) {
        skillRepository.getSkills().let { result ->
            when (result) {
                is SkillRepository.Result.Success -> {
                    skills = result.data.skills
                    categories = result.data.categories
                    isLoading = false
                }
                is SkillRepository.Result.Error -> {
                    errorMessage = result.message
                    isLoading = false
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.Surface)
            .padding(horizontal = 16.dp, vertical = 20.dp)
            .heightIn(max = 500.dp)
    ) {
        SheetDragHandle()

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "选择技能",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = colors.TextPrimary
        )

        Spacer(modifier = Modifier.height(12.dp))

        SearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            colors = colors
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (categories.isNotEmpty()) {
            CategoryFilterRow(
                categories = categories,
                selectedCategory = selectedCategory,
                onCategorySelected = { cat ->
                    selectedCategory = if (cat == selectedCategory) null else cat
                },
                colors = colors
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        when {
            isLoading -> {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = colors.PrimaryLight
                    )
                }
            }
            errorMessage != null -> {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = errorMessage ?: "加载失败",
                        color = colors.TextSecondary,
                        fontSize = 13.sp
                    )
                }
            }
            else -> {
                val filteredSkills = filterSkills(skills, selectedCategory, searchQuery)
                if (filteredSkills.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "暂无可用技能",
                            color = colors.TextSecondary,
                            fontSize = 13.sp
                        )
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(
                            items = filteredSkills,
                            key = { it.id }
                        ) { skill ->
                            SkillItem(
                                skill = skill,
                                onClick = {
                                    onSkillSelected(SkillAttachment(
                                        id = skill.id,
                                        name = skill.name,
                                        description = skill.description
                                    ))
                                },
                                colors = colors
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 搜索栏
 */
@Composable
private fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = colors.SurfaceVariant
    ) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier.fillMaxWidth()
        ) {
            androidx.compose.material3.TextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = {
                    Text(
                        text = "搜索技能...",
                        color = colors.TextSecondary,
                        fontSize = 14.sp
                    )
                },
                colors = androidx.compose.material3.TextFieldDefaults.colors(
                    focusedContainerColor = colors.SurfaceVariant,
                    unfocusedContainerColor = colors.SurfaceVariant,
                    focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                    unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                    cursorColor = colors.PrimaryLight,
                    focusedTextColor = colors.TextPrimary,
                    unfocusedTextColor = colors.TextPrimary
                ),
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.sp)
            )
        }
    }
}

/**
 * 类别筛选行
 */
@Composable
private fun CategoryFilterRow(
    categories: List<SkillCategory>,
    selectedCategory: String?,
    onCategorySelected: (String?) -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    androidx.compose.foundation.lazy.LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(categories.size) { index ->
            val category = categories[index]
            val isSelected = category.id == selectedCategory
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = if (isSelected) colors.PrimaryLight.copy(alpha = 0.15f) else colors.SurfaceVariant,
                border = if (isSelected) androidx.compose.foundation.BorderStroke(
                    1.dp, colors.PrimaryLight.copy(alpha = 0.3f)
                ) else null
            ) {
                Text(
                    text = category.name,
                    modifier = Modifier
                        .clickable { onCategorySelected(category.id) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    fontSize = 12.sp,
                    color = if (isSelected) colors.PrimaryLight else colors.TextSecondary,
                    fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal
                )
            }
        }
    }
}

/**
 * 技能列表项
 */
@Composable
private fun SkillItem(
    skill: SkillDefinition,
    onClick: () -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = colors.SurfaceVariant,
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(
                modifier = Modifier.size(40.dp),
                shape = RoundedCornerShape(10.dp),
                color = colors.PrimaryLight.copy(alpha = 0.1f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(text = "⚡", fontSize = 18.sp)
                }
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = skill.name,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.TextPrimary,
                    maxLines = 1
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = skill.description,
                    fontSize = 12.sp,
                    color = colors.TextSecondary,
                    maxLines = 2,
                    lineHeight = 16.sp
                )
            }

            if (skill.tags.contains("内置")) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = colors.PrimaryLight.copy(alpha = 0.1f)
                ) {
                    Text(
                        text = "内置",
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        fontSize = 10.sp,
                        color = colors.PrimaryLight,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

/**
 * 拖拽手柄
 */
@Composable
private fun SheetDragHandle() {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier
                .width(40.dp)
                .height(4.dp),
            shape = RoundedCornerShape(2.dp),
            color = androidx.compose.ui.graphics.Color(0xFFDDDDDD)
        ) {}
    }
}

/**
 * 过滤技能列表
 */
private fun filterSkills(
    skills: List<SkillDefinition>,
    category: String?,
    query: String?
): List<SkillDefinition> {
    var result = skills.filter { it.isEnabled }
    if (category != null) {
        result = result.filter { it.category.id == category }
    }
    if (!query.isNullOrBlank()) {
        val lowerQuery = query.lowercase()
        result = result.filter {
            it.name.lowercase().contains(lowerQuery) ||
            it.description.lowercase().contains(lowerQuery) ||
            it.tags.any { tag -> tag.lowercase().contains(lowerQuery) }
        }
    }
    return result
}
