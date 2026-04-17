# Cleanup Duplicate Worker Containers Script
# Keep the latest container for each user, delete duplicates

Write-Host "====================================="
Write-Host "  Cleanup Duplicate Worker Containers"
Write-Host "=====================================`n"

# Get all user containers
$containers = docker ps --filter "name=claude-user-" --format "{{.Names}}|{{.ID}}|{{.Ports}}" | ForEach-Object { $_.Trim() }

if (-not $containers) {
    Write-Host "No user containers found"
    exit 0
}

Write-Host "Found $($containers.Count) user containers`n"

# Group by user ID
$userContainers = @{}
foreach ($container in $containers) {
    $parts = $container.Split('|')
    $containerName = $parts[0]
    $containerId = $parts[1]
    
    # Extract user ID (format: claude-user-{userId}-{random})
    if ($containerName -match 'claude-user-([a-f0-9-]+)') {
        $userId = $matches[1]
        
        if (-not $userContainers.ContainsKey($userId)) {
            $userContainers[$userId] = @()
        }
        $userContainers[$userId] += @{
            Name = $containerName
            Id = $containerId
        }
    }
}

# Process each user
$deletedCount = 0
foreach ($userId in $userContainers.Keys) {
    $userContainersList = $userContainers[$userId]
    
    if ($userContainersList.Count -gt 1) {
        Write-Host "User $userId has $($userContainersList.Count) containers, cleaning up..."
        
        # Keep the first one, delete others
        $keepContainer = $userContainersList[0]
        Write-Host "  Keep: $($keepContainer.Name)"
        
        for ($i = 1; $i -lt $userContainersList.Count; $i++) {
            $toDelete = $userContainersList[$i]
            Write-Host "  Delete: $($toDelete.Name)"
            
            docker stop $toDelete.Id
            docker rm $toDelete.Id
            $deletedCount++
        }
        
        Write-Host ""
    }
}

Write-Host "====================================="
Write-Host "  Cleanup Complete"
Write-Host "====================================="
Write-Host "Containers deleted: $deletedCount"
Write-Host ""
